type MathAlphabet = 'italic' | 'double-struck'

// Unicode retains these letters in the older Letterlike Symbols block.
const DOUBLE_STRUCK: Readonly<Record<string, string>> = {
  C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ',
}
const ITALIC: Readonly<Record<string, string>> = {
  h: 'ℎ', 'ϴ': '𝛳', '∂': '𝜕', 'ϵ': '𝜖', 'ϑ': '𝜗',
  'ϰ': '𝜘', 'ϕ': '𝜙', 'ϱ': '𝜚', 'ϖ': '𝜛',
}

// Map semantic letters to the encoded alphabet; leave other symbols unchanged.
function math_alphabet(text: string, alphabet: MathAlphabet): string {
  const italic = alphabet === 'italic'
  const exceptions = italic ? ITALIC : DOUBLE_STRUCK
  return [...text].map(char => {
    if (exceptions[char]) return exceptions[char]
    const code = char.codePointAt(0)!
    if (code >= 0x41 && code <= 0x5a) {
      return String.fromCodePoint(code - 0x41 + (italic ? 0x1d434 : 0x1d538))
    }
    if (code >= 0x61 && code <= 0x7a) {
      return String.fromCodePoint(code - 0x61 + (italic ? 0x1d44e : 0x1d552))
    }
    if (!italic && code >= 0x30 && code <= 0x39) {
      return String.fromCodePoint(code - 0x30 + 0x1d7d8)
    }
    if (italic && code >= 0x391 && code <= 0x3a9 && code !== 0x3a2) {
      return String.fromCodePoint(code - 0x391 + 0x1d6e2)
    }
    if (italic && code >= 0x3b1 && code <= 0x3c9) {
      return String.fromCodePoint(code - 0x3b1 + 0x1d6fc)
    }
    return char
  }).join('')
}

export { math_alphabet }
