/**
 * Splits AI suggestion text into natural message segments.
 * Simulates how a human types: short, conversational messages.
 */
export function splitMessage(text: string): string[] {
  if (!text || text.trim().length < 80) return [text.trim()]

  // Split by sentence boundaries (. ! ? followed by space + uppercase or end)
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÀÃÉÊÍÓÔÕÚÇ])/u)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length <= 1) return [text.trim()]

  // Merge short sentences (<30 chars) with previous
  const merged: string[] = []
  for (const sentence of sentences) {
    if (merged.length > 0 && sentence.length < 30) {
      merged[merged.length - 1] += ' ' + sentence
    } else {
      merged.push(sentence)
    }
  }

  // If too many segments, reduce to max 4
  if (merged.length > 4) {
    const result: string[] = []
    const perGroup = Math.ceil(merged.length / 4)
    for (let i = 0; i < merged.length; i += perGroup) {
      result.push(merged.slice(i, i + perGroup).join(' '))
    }
    return result
  }

  // If only 1 after merging but text is long, split by line breaks or commas
  if (merged.length === 1 && text.length > 120) {
    const byLineBreak = text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (byLineBreak.length >= 2) return byLineBreak.slice(0, 4)
  }

  return merged
}
