#!/usr/bin/env python3
"""VOICEVOX-compatible HTTP wrapper for Irodori-TTS-Lite.

This server exposes the endpoints expected by the CursorTuberKit VOICEVOX client:
  GET  /version
  GET  /speakers
  POST /audio_query?text=...&speaker=...
  POST /synthesis?speaker=...&enable_interrogative_upspeak=...

The request body for /synthesis is the audio_query JSON. Irodori itself does not
support intonation/pitch/speed/volume overrides, so those fields are ignored and
the model's native voice is returned.

Requires `irodori_tts` and `irodori_tts_lite` to be installed in the active
Python environment, plus `pyopenjtalk` for phoneme-based duration estimation.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VOICEVOX-compatible Irodori-TTS-Lite server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind on")
    parser.add_argument("--port", type=int, default=50021, help="Port to listen on")
    parser.add_argument("--checkpoint", default=None, help="Local path or hf://<org>/<repo>/<file>")
    parser.add_argument("--no-ref", action="store_true", help="Voice-design checkpoint mode")
    parser.add_argument("--no-fused", action="store_true", help="Disable FusedInt4Linear")
    parser.add_argument("--no-fp16", dest="fp16", action="store_false", help="Disable forced fp16 dtype")
    parser.set_defaults(fp16=True)
    return parser.parse_args()


def load_infer_module(args: argparse.Namespace):
    """Configure and patch Irodori-TTS-Lite, then import the upstream infer module."""
    import irodori_tts_lite

    irodori_tts_lite.configure(
        use_fused=not args.no_fused,
        force_fp16=args.fp16,
    )
    irodori_tts_lite.patch()

    checkpoint_path = irodori_tts_lite.resolve_checkpoint(args.checkpoint)
    if checkpoint_path != (args.checkpoint or ""):
        print(f"[irodori-tts-server] checkpoint: {checkpoint_path}", flush=True)

    import infer  # from irodori_tts, available after patch

    infer.CHECKPOINT = checkpoint_path
    infer.NO_REF = args.no_ref
    infer.FIXED_SECONDS = 2.0
    return infer


def estimate_seconds(text: str) -> float:
    """Estimate audio duration from Japanese phoneme count."""
    try:
        import pyopenjtalk

        phs = pyopenjtalk.g2p(text, kana=False).split()
        return max(2.0, len(phs) / 11.0 + 0.6)
    except Exception:
        return 2.0


def make_handler(infer_module):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print(f"[irodori-tts-server] {self.address_string()} {fmt % args}", flush=True)

        def _send_json(self, status: int, body):
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _send_wav(self, data: bytes):
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _read_json(self) -> dict:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/version":
                self._send_json(200, "0.0.0-irodori")
                return
            if parsed.path == "/speakers":
                self._send_json(200, [
                    {
                        "name": "Irodori",
                        "speaker_uuid": "irodori-default",
                        "styles": [{"id": 0, "name": "default", "type": "talk"}],
                    }
                ])
                return
            self.send_error(404)

        def do_POST(self):
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query, keep_blank_values=True)

            if parsed.path == "/audio_query":
                text = _first(query.get("text", [""])).strip()
                if not text:
                    self.send_error(400, "text is required")
                    return
                self._send_json(200, {
                    "text": text,
                    "intonationScale": 1.0,
                    "pitchScale": 0.0,
                    "speedScale": 1.0,
                    "volumeScale": 1.0,
                    "prePhonemeLength": 0.0,
                    "postPhonemeLength": 0.0,
                    "outputSamplingRate": 24000,
                    "outputStereo": False,
                    "accentPhrases": [],
                })
                return

            if parsed.path == "/synthesis":
                audio_query = self._read_json()
                text = _first(query.get("text", [""])) or audio_query.get("text", "")
                text = text.strip()
                if not text:
                    self.send_error(400, "text is required")
                    return

                seconds = audio_query.get("seconds")
                if seconds is None or not isinstance(seconds, (int, float)):
                    seconds = estimate_seconds(text)

                try:
                    wav = synthesize(infer_module, text, float(seconds))
                except Exception as exc:
                    print(f"[irodori-tts-server] synthesis failed: {exc}", flush=True)
                    self.send_error(500, str(exc))
                    return

                self._send_wav(wav)
                return

            self.send_error(404)

    return Handler


def _first(values):
    return values[0] if values else ""


def synthesize(infer_module, text: str, seconds: float) -> bytes:
    """Run Irodori inference and return WAV bytes.

    The upstream `infer.main()` expects command-line arguments. We mutate `sys.argv`
    and global attributes on the module to drive it from an HTTP request. This is
    the simplest integration point when using the stock `irodori_tts` pipeline.
    """
    checkpoint = getattr(infer_module, "CHECKPOINT", None)
    no_ref = getattr(infer_module, "NO_REF", True)
    infer_module.FIXED_SECONDS = float(seconds)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        output_path = tmp.name

    try:
        sys.argv = [
            sys.argv[0],
            "--checkpoint",
            str(checkpoint) if checkpoint else "",
            "--text",
            text,
            "--output-wav",
            output_path,
        ]
        if no_ref:
            sys.argv.append("--no-ref")

        infer_module.main()

        with open(output_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


def main() -> int:
    args = parse_args()
    infer_module = load_infer_module(args)
    handler = make_handler(infer_module)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"[irodori-tts-server] listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[irodori-tts-server] shutting down", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
