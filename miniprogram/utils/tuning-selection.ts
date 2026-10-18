export const standardTuning = [
  { number: 6, note: 'E' },
  { number: 5, note: 'A' },
  { number: 4, note: 'D' },
  { number: 3, note: 'G' },
  { number: 2, note: 'B' },
  { number: 1, note: 'E' },
] as const

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
