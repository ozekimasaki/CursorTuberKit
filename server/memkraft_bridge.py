#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from typing import Any

from memkraft import MemKraft


CURRENT_MEMORY_SCHEMA_VERSION = 2
LEGACY_ASSISTANT_IDENTITY = "キャットリンは月灯りのティーサロンから来たメイド猫の配信アシスタント"
LEGACY_CONTEXT_MARKERS = (
    "めいさん",
    "配信のお手伝い",
    "そっと横で整え",
    "配信アシスタント",
)
LEGACY_OPERATOR_PROMPTS = (
    "配信開始の挨拶を、上品でかわいくお願い",
    "コメント欄が静かなときの場つなぎを考えて",
    "初見さんを歓迎する一言をやさしく作って",
    "配信終わりの締めコメントを余韻ありでお願い",
)
DEFAULT_CHANNEL_MEMORY = {
    "continuity_notes": [],
    "recent_exchanges": [],
    "running_summary": "",
    "last_assistant_message": "",
    "last_user_message": "",
}

DEFAULT_AGENT_MEMORY = {
    "memory_schema_version": CURRENT_MEMORY_SCHEMA_VERSION,
    "continuity_goal": "過去のやり取りを踏まえてキャットリンの発話を自然につなげる",
    "continuity_rules": [
        "呼称や距離感を急にリセットしない",
        "直近の話題や雰囲気を優先して拾う",
        "古い記憶より今回の依頼と近い文脈を優先する",
    ],
    "identity": "キャットリンは月灯りのティーサロンから来た、みずから配信を行うメイド猫のAIキャラクター",
}


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("command is required\n")
        return 1

    command = sys.argv[1]
    payload = read_payload()
    memory_dir = os.environ.get("MEMKRAFT_DIR", os.path.join(os.getcwd(), "memory"))
    channel_id = os.environ.get("MEMKRAFT_CHANNEL_ID", "catlin-global")
    agent_id = os.environ.get("MEMKRAFT_AGENT_ID", "catlin")

    mk = MemKraft(memory_dir)
    bootstrap(mk, agent_id=agent_id, channel_id=channel_id)

    if command == "health":
        return write_json(
            {
                "ok": True,
                "memory_dir": memory_dir,
                "channel_id": channel_id,
                "agent_id": agent_id,
            }
        )

    if command == "load_context":
        channel_data = mk.channel_load(channel_id)
        return write_json(
            {
                "injection": mk.agent_inject(agent_id, channel_id=channel_id, max_history=4),
                "running_summary": stringify(channel_data.get("running_summary")),
                "continuity_notes": normalize_string_list(channel_data.get("continuity_notes")),
                "recent_exchanges": normalize_exchanges(channel_data.get("recent_exchanges")),
            }
        )

    if command == "store_exchange":
        user_prompt = stringify(payload.get("user_prompt")).strip()
        assistant_response = stringify(payload.get("assistant_response")).strip()
        recent_turns = normalize_turns(payload.get("recent_turns"))

        if not user_prompt or not assistant_response:
            raise ValueError("user_prompt and assistant_response are required")

        channel_data = mk.channel_load(channel_id)
        recent_exchanges = normalize_exchanges(channel_data.get("recent_exchanges"))
        recent_exchanges.append({"user": user_prompt, "assistant": assistant_response})
        recent_exchanges = recent_exchanges[-6:]

        continuity_notes = normalize_string_list(channel_data.get("continuity_notes"))
        continuity_notes.append(build_exchange_note(user_prompt, assistant_response))
        continuity_notes = dedupe_keep_latest(continuity_notes)[-6:]

        running_summary = build_running_summary(recent_exchanges)
        topics = extract_topic_fragments(recent_turns + [
            {"role": "user", "text": user_prompt},
            {"role": "assistant", "text": assistant_response},
        ])

        mk.channel_save(
            channel_id,
            {
                "continuity_notes": continuity_notes,
                "last_assistant_message": assistant_response,
                "last_user_message": user_prompt,
                "recent_exchanges": recent_exchanges,
                "running_summary": running_summary,
            },
        )
        mk.agent_save(
            agent_id,
            {
                "last_reply_excerpt": clip(assistant_response, 120),
                "recent_topics": topics,
            },
        )
        mk.log_event(
            event=f"Stored Catlin exchange: {clip(user_prompt, 60)}",
            tags="catlin,continuity,chat",
            entity="キャットリン",
            task="catlin-global-memory",
        )
        return write_json({"ok": True, "recent_exchanges": recent_exchanges})

    sys.stderr.write(f"unsupported command: {command}\n")
    return 1


def bootstrap(mk: MemKraft, *, agent_id: str, channel_id: str) -> None:
    mk.init(verbose=False)
    loaded_agent = mk.agent_load(agent_id)
    loaded_channel = mk.channel_load(channel_id)
    agent_data = loaded_agent if isinstance(loaded_agent, dict) else {}
    channel_data = loaded_channel if isinstance(loaded_channel, dict) else {}

    if should_reset_legacy_memory(agent_data, channel_data):
        mk.agent_save(agent_id, dict(DEFAULT_AGENT_MEMORY))
        mk.channel_save(channel_id, dict(DEFAULT_CHANNEL_MEMORY))
        return

    if not agent_data:
        mk.agent_save(agent_id, dict(DEFAULT_AGENT_MEMORY))
    else:
        migrated_agent = migrate_agent_memory(agent_data)
        if migrated_agent != agent_data:
            mk.agent_save(agent_id, migrated_agent)

    if not channel_data:
        mk.channel_save(channel_id, dict(DEFAULT_CHANNEL_MEMORY))
    else:
        migrated_channel = migrate_channel_memory(channel_data)
        if migrated_channel != channel_data:
            mk.channel_save(channel_id, migrated_channel)


def should_reset_legacy_memory(agent_data: dict[str, Any], channel_data: dict[str, Any]) -> bool:
    identity = agent_data.get("identity")
    if isinstance(identity, str) and identity.strip() == LEGACY_ASSISTANT_IDENTITY:
        return True
    return has_legacy_channel_context(channel_data)


def has_legacy_channel_context(channel_data: dict[str, Any]) -> bool:
    texts = [
        *normalize_string_list(channel_data.get("continuity_notes")),
        stringify(channel_data.get("running_summary")),
        stringify(channel_data.get("last_assistant_message")),
        stringify(channel_data.get("last_user_message")),
    ]

    for exchange in normalize_exchanges(channel_data.get("recent_exchanges")):
        texts.append(exchange["user"])
        texts.append(exchange["assistant"])

    return any(looks_like_legacy_context(text) for text in texts)


def looks_like_legacy_context(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return False
    return any(marker in normalized for marker in LEGACY_CONTEXT_MARKERS) or normalized in LEGACY_OPERATOR_PROMPTS


def migrate_agent_memory(agent_data: dict[str, Any]) -> dict[str, Any]:
    migrated = dict(agent_data)
    migrated.update(DEFAULT_AGENT_MEMORY)
    return migrated


def migrate_channel_memory(channel_data: dict[str, Any]) -> dict[str, Any]:
    return {
        **channel_data,
        "continuity_notes": [normalize_memory_text(note) for note in normalize_string_list(channel_data.get("continuity_notes"))][-6:],
        "recent_exchanges": normalize_exchanges(channel_data.get("recent_exchanges")),
        "running_summary": normalize_memory_text(stringify(channel_data.get("running_summary")).strip()),
        "last_assistant_message": normalize_memory_text(stringify(channel_data.get("last_assistant_message")).strip()),
        "last_user_message": stringify(channel_data.get("last_user_message")).strip(),
    }


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def write_json(payload: dict[str, Any]) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0


def stringify(value: Any) -> str:
    return value if isinstance(value, str) else ""


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    values: list[str] = []
    for entry in value:
        if isinstance(entry, str):
            normalized = entry.strip()
            if normalized:
                values.append(normalized)
    return values


def normalize_memory_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return ""
    return (
        normalized.replace(LEGACY_ASSISTANT_IDENTITY, DEFAULT_AGENT_MEMORY["identity"])
        .replace("ユーザー:", "視聴者:")
        .replace("ユーザーからの依頼", "今回の視聴者コメント")
    )


def normalize_turns(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    turns: list[dict[str, str]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        text = entry.get("text")
        if role not in {"user", "assistant"} or not isinstance(text, str):
            continue
        normalized = text.strip()
        if not normalized:
            continue
        turns.append({"role": role, "text": normalized})
    return turns[-8:]


def normalize_exchanges(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    exchanges: list[dict[str, str]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        user = entry.get("user")
        assistant = entry.get("assistant")
        if not isinstance(user, str) or not isinstance(assistant, str):
            continue
        user_text = user.strip()
        assistant_text = assistant.strip()
        if not user_text or not assistant_text:
            continue
        exchanges.append({"user": user_text, "assistant": assistant_text})
    return exchanges[-6:]


def build_exchange_note(user_prompt: str, assistant_response: str) -> str:
    return f"直近では視聴者コメント『{clip(user_prompt, 40)}』に対して『{clip(assistant_response, 60)}』と返した"


def build_running_summary(exchanges: list[dict[str, str]]) -> str:
    if not exchanges:
        return ""
    lines = ["最近の流れ:"]
    for exchange in exchanges[-4:]:
        lines.append(
            f"- 視聴者: {clip(exchange['user'], 50)} / キャットリン: {clip(exchange['assistant'], 72)}"
        )
    return "\n".join(lines)


def extract_topic_fragments(turns: list[dict[str, str]]) -> list[str]:
    topics: list[str] = []
    for turn in turns[-6:]:
        fragment = clip(turn["text"].replace("\n", " ").strip(), 28)
        if len(fragment) < 4:
            continue
        topics.append(fragment)
    return dedupe_keep_latest(topics)[-5:]


def dedupe_keep_latest(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in reversed(values):
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    result.reverse()
    return result


def clip(value: str, max_length: int) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max(0, max_length - 1)] + "…"


if __name__ == "__main__":
    raise SystemExit(main())
