export type Viseme = "closed" | "a" | "i" | "u" | "e" | "o"

const vowelGroups: Record<Exclude<Viseme, "closed">, string> = {
  a: "あぁかがさざただなはばぱまやゃらわゎゕ",
  i: "いぃきぎしじちぢにひびぴみりゐ",
  u: "うぅくぐすずつづぬふぶぷむゆゅるゔ",
  e: "えぇけげせぜてでねへべぺめれゑゖ",
  o: "おぉこごそぞとどのほぼぽもよょろを",
}

const pausePattern = /[、。，．！？!?.,…「」『』（）()［］\[\]【】〈〉《》:;：；・\s]/
const smallKanaToVowel: Partial<Record<string, Exclude<Viseme, "closed">>> = {
  ぁ: "a",
  ァ: "a",
  ぃ: "i",
  ィ: "i",
  ぅ: "u",
  ゥ: "u",
  ぇ: "e",
  ェ: "e",
  ぉ: "o",
  ォ: "o",
  ゃ: "a",
  ャ: "a",
  ゅ: "u",
  ュ: "u",
  ょ: "o",
  ョ: "o",
}

const kanaToVowel: Record<string, Exclude<Viseme, "closed">> = {}

for (const [vowel, kana] of Object.entries(vowelGroups) as Array<
  [Exclude<Viseme, "closed">, string]
>) {
  for (const ch of kana) {
    kanaToVowel[ch] = vowel
    const code = ch.charCodeAt(0)
    if (code >= 0x3041 && code <= 0x3096) {
      kanaToVowel[String.fromCharCode(code + 0x60)] = vowel
    }
  }
}

export type VisemeStep = {
  viseme: Viseme
  weight: number
}

export function textToVisemeSteps(text: string): VisemeStep[] {
  const steps: VisemeStep[] = []
  let lastVowel: Exclude<Viseme, "closed"> | null = null

  for (const ch of text.normalize("NFKC")) {
    const smallKanaVowel = smallKanaToVowel[ch]
    if (smallKanaVowel && steps.length > 0) {
      const previous = steps[steps.length - 1]
      if (previous.viseme !== "closed") {
        previous.viseme = smallKanaVowel
        lastVowel = smallKanaVowel
        continue
      }
    }

    if (kanaToVowel[ch]) {
      const v = kanaToVowel[ch]
      steps.push({ viseme: v, weight: 1 })
      lastVowel = v
      continue
    }

    if (ch === "ー" || ch === "ｰ") {
      steps.push(lastVowel ? { viseme: lastVowel, weight: 1 } : { viseme: "closed", weight: 0.4 })
      continue
    }

    if (ch === "ん" || ch === "ン") {
      steps.push({ viseme: "closed", weight: 0.6 })
      lastVowel = null
      continue
    }

    if (ch === "っ" || ch === "ッ") {
      steps.push({ viseme: "closed", weight: 0.4 })
      continue
    }

    if (pausePattern.test(ch)) {
      steps.push({ viseme: "closed", weight: 0.7 })
      lastVowel = null
      continue
    }

    if (/\p{Script=Han}/u.test(ch)) {
      const fallback: Array<Exclude<Viseme, "closed">> = ["a", "o", "e", "u", "i"]
      const v = fallback[(ch.codePointAt(0) ?? steps.length) % fallback.length]
      steps.push({ viseme: v, weight: 0.9 })
      lastVowel = v
      continue
    }

    if (/[A-Za-z0-9]/.test(ch)) {
      steps.push({ viseme: "a", weight: 0.7 })
      lastVowel = "a"
      continue
    }
  }

  return steps
}
