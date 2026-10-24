import { mkdirSync, writeFileSync } from 'node:fs'

// Standard tuning at A4 = 440 Hz. Guitar-style synthesis, not guitar recordings.
const strings = [[6, 40], [5, 45], [4, 50], [3, 55], [2, 59], [1, 64]]
const sampleRate = 44100
const duration = 3
const output = new URL('../miniprogram/assets/tones/', import.meta.url)
mkdirSync(output, { recursive: true })

for (const [number, midi] of strings) {
  const frequency = 440 * 2 ** ((midi - 69) / 12)
  const samples = new Float64Array(sampleRate * duration)
  let seed = 100 + number
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate
    let value = 0
    // A pluck excites harmonics; higher harmonics fade faster than the fundamental.
    for (let harmonic = 1; harmonic <= 24; harmonic++) {
      const amplitude = Math.sin(Math.PI * harmonic * .23) / harmonic ** 1.3
      const decay = .72 * Math.exp(-time * (5 + harmonic * .8))
        + .28 * Math.exp(-time * (1.3 + harmonic * .15))
      value += amplitude * decay
        * Math.sin(2 * Math.PI * frequency * harmonic * time)
    }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    value += (seed / 2 ** 32 - .5) * .025 * Math.exp(-time * 200)
    const fade = Math.min(1, time / .002, (duration - time) / .15)
    samples[i] = value * fade
  }

  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  const wav = Buffer.alloc(44 + samples.length * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // Mono
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    wav.writeInt16LE(Math.round(samples[i] / peak * .75 * 32767), 44 + i * 2)
  }
  writeFileSync(new URL(`string-${number}.wav`, output), wav)
  console.log(`String ${number}: ${frequency.toFixed(3)} Hz, ${duration}s`)
}
