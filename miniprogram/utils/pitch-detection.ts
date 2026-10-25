// Normalized mono PCM (-1..1), covering standard guitar open strings and detuning.
// Uses YIN's cumulative mean normalized difference, comparing all period minima
// before choosing the shortest near-best period (rather than the loudest harmonic).
export function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return null
  const maxLag = Math.ceil(sampleRate / 65)
  if (samples.length < 2 * (maxLag + 1)) return null
  let sum = 0
  let squares = 0
  for (const sample of samples) {
    if (!Number.isFinite(sample) || Math.abs(sample) > 1) return null
    sum += sample
    squares += sample * sample
  }
  // Reject silence and DC; the threshold needs validation with real microphone PCM.
  const power = squares / samples.length - (sum / samples.length) ** 2
  if (power < 1e-6) return null

  const difference = new Float64Array(maxLag + 2)
  // Compare the most recent 64ms, retaining enough periods for the lowest string.
  const window = Math.min(samples.length - maxLag - 1, Math.round(sampleRate * .064))
  const offset = samples.length - maxLag - window - 1
  let cumulative = 0
  difference[0] = 1
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let value = 0
    for (let i = offset; i < offset + window; i++) value += (samples[i] - samples[i + lag]) ** 2
    cumulative += value
    difference[lag] = cumulative > 0 ? value * lag / cumulative : 1
  }
  const candidates: { period: number; error: number }[] = []
  // Include higher pitches here, then reject them below instead of folding them down.
  for (let lag = 2; lag <= maxLag; lag++) {
    const left = difference[lag - 1], center = difference[lag], right = difference[lag + 1]
    if (center >= left || center >= right) continue
    // Interpolate both the period and error to avoid favoring integer-period octaves.
    const shift = (left - right) / (2 * (left - 2 * center + right))
    candidates.push({ period: lag + shift, error: Math.max(0, center - (left - right) * shift / 4) })
  }
  const bestError = Math.min(...candidates.map(candidate => candidate.error))
  // A half-period may look plausible when the second harmonic is strong. Require
  // a near-best match; 0.005 is a conservative initial tolerance, not a guarantee.
  const candidate = candidates.find(value => value.error < .1 && value.error <= bestError + .005)
  if (!candidate) return null
  const frequency = sampleRate / candidate.period
  return frequency >= 65 && frequency <= 400 ? frequency : null
}
