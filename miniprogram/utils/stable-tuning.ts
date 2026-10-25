// A string must remain within ±3 cents for 250ms before confirming it is tuned.
export function createStableTuningConfirmation() {
  let target: number | null = null
  let since = 0
  return (number: number | null, cents: number, now: number): boolean => {
    if (number === null || !Number.isFinite(cents) || Math.abs(cents) > 3 + 1e-7) {
      target = null
      return false
    }
    if (target !== number || now < since) {
      target = number
      since = now
    }
    return now - since >= 250
  }
}
