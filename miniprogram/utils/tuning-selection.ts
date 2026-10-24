export const standardTuning = [
  { number: 6, note: 'E' },
  { number: 5, note: 'A' },
  { number: 4, note: 'D' },
  { number: 3, note: 'G' },
  { number: 2, note: 'B' },
  { number: 1, note: 'E' },
] as const

// MIDI notes for strings 1 through 6, at A4 = 440 Hz.
const midiByString = [64, 59, 55, 50, 45, 40] as const

export function getStringFrequency(stringNumber: number) {
  if (!standardTuning.some(string => string.number === stringNumber)) return null
  return 440 * 2 ** ((midiByString[stringNumber - 1] - 69) / 12)
}

export type TuningSelection =
  | { mode: 'auto'; target: null }
  | { mode: 'manual'; target: typeof standardTuning[number] }

export function useAutomaticSelection(): TuningSelection {
  return { mode: 'auto', target: null }
}

export function selectString(current: TuningSelection, stringNumber: number): TuningSelection {
  const target = standardTuning.find(string => string.number === stringNumber)
  return target ? { mode: 'manual', target } : current
}

// Accepts a detected frequency; signal confidence and temporal stability are handled separately.
export function getPitchReading(frequency: number, stringNumber?: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null
  const pitch = 69 + 12 * (Math.log2(frequency) - Math.log2(440))
  let reading: { target: typeof standardTuning[number]; cents: number } | null = null
  for (const target of standardTuning) {
    if (stringNumber !== undefined && target.number !== stringNumber) continue
    const cents = (pitch - midiByString[target.number - 1]) * 100
    if (!reading || Math.abs(cents) < Math.abs(reading.cents)) reading = { target, cents }
  }
  return reading
}
