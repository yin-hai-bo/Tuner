// Independent MPM/NSDF implementation; see McLeod & Wyvill (2005),
// "A Smarter Way to Find Pitch". Input: normalized mono PCM, output: Hz and clarity.
export function detectMpmPitch(samples: Float32Array, sampleRate: number, input?: { silent: boolean }): { frequency: number; clarity: number } | null {
  if (input) input.silent = false
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return null
  const maxLag = Math.ceil(sampleRate / 65)
  if (samples.length < 2 * (maxLag + 1)) return null
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i]) || Math.abs(samples[i]) > 1) return null
  }
  // Bound the work to recent audio, avoiding FFT dependencies and long input queues.
  const length = Math.min(samples.length, Math.ceil(sampleRate * .08))
  const offset = samples.length - length
  let mean = 0
  for (let i = offset; i < samples.length; i++) mean += samples[i] / length
  const centered = new Float64Array(length), energy = new Float64Array(length + 1)
  for (let i = 0; i < length; i++) {
    centered[i] = samples[offset + i] - mean
    energy[i + 1] = energy[i] + centered[i] ** 2
  }
  const power = energy[length] / length
  if (input) input.silent = power < 1e-6
  if (power < 1e-6) return null
  const nsdf = new Float64Array(maxLag + 2)
  nsdf[0] = 1
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let correlation = 0
    for (let i = 0; i < length - lag; i++) correlation += centered[i] * centered[i + lag]
    const denominator = energy[length - lag] + energy[length] - energy[lag]
    nsdf[lag] = denominator > 0 ? 2 * correlation / denominator : 0
  }
  // One key maximum per positive lobe, ignoring the initial zero-lag lobe.
  const peaks: number[] = []
  let crossedZero = false, peak = 0
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    if (nsdf[lag] <= 0) {
      if (peak > 0) peaks.push(peak)
      crossedZero = true
      peak = 0
    } else if (crossedZero && (peak === 0 || nsdf[lag] > nsdf[peak])) peak = lag
  }
  if (peak > 0 && peak <= maxLag) peaks.push(peak)
  const candidates = peaks.filter(index => index > 0 && index <= maxLag).map(index => {
    const left = nsdf[index - 1], center = nsdf[index], right = nsdf[index + 1]
    const curve = left - 2 * center + right
    const shift = curve < 0 ? (left - right) / (2 * curve) : 0
    return { frequency: sampleRate / (index + shift), clarity: Math.min(1, center - (left - right) * shift / 4) }
  })
  const strongest = Math.max(0, ...candidates.map(candidate => candidate.clarity))
  const chosen = candidates.find(candidate => candidate.clarity >= .75 && candidate.clarity >= strongest * .9)
  // Reject high pitches after peak selection, rather than forcing them down an octave.
  return chosen && chosen.frequency >= 65 && chosen.frequency <= 400 ? chosen : null
}
