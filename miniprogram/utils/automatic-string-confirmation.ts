// Feed reliable pitch candidates continuously; null interrupts confirmation.
export function createAutomaticStringConfirmation() {
  let candidate: number | null = null
  let since = 0
  return (number: number | null, now: number): number | null => {
    if (number === null || number !== candidate || now < since) {
      candidate = number
      since = now
      return null
    }
    return now - since >= 300 ? number : null
  }
}
