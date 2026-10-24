import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Inspect the generated files, rather than trusting the synthesizer's parameters.
for (const [number, expected] of [[6, 82.4069], [5, 110], [4, 146.8324], [3, 195.9977], [2, 246.9417], [1, 329.6276]]) {
  test(`string ${number} has three seconds of decay at its standard pitch without clipping`, () => {
    const wav = readFileSync(new URL(`../miniprogram/assets/tones/string-${number}.wav`, import.meta.url))
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ')
    assert.equal(wav.readUInt32LE(4), wav.length - 8)
    assert.equal(wav.readUInt16LE(20), 1)
    assert.equal(wav.readUInt16LE(22), 1)
    assert.equal(wav.readUInt16LE(34), 16)
    const rate = wav.readUInt32LE(24)
    const count = wav.readUInt32LE(40) / 2
    assert.equal(count / rate, 3)
    const samples = Array.from({ length: count }, (_, i) => wav.readInt16LE(44 + i * 2))
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    assert.ok(peak > 10000 && peak < 32767)
    assert.equal(samples[0], 0)
    assert.ok(Math.abs(samples.at(-1)) < 10)

    const rms = (start, end) => {
      const segment = samples.slice(Math.floor(start * rate), Math.floor(end * rate))
      return Math.sqrt(segment.reduce((sum, value) => sum + value ** 2, 0) / segment.length)
    }
    const attack = rms(.03, .15), middle = rms(.5, .65), tail = rms(2.3, 2.5)
    assert.ok(middle < attack * .5, 'The initial sound should decay quickly')
    assert.ok(tail > attack * .003, 'The tail should retain a quiet audible signal')
    assert.ok(tail < middle * .25, 'The tail should continue to fade')

    const correlation = lag => {
      let dot = 0, left = 0, right = 0
      for (let i = Math.floor(rate * .1); i < rate * .5; i++) {
        dot += samples[i] * samples[i + lag]
        left += samples[i] ** 2
        right += samples[i + lag] ** 2
      }
      return dot / Math.sqrt(left * right)
    }
    let best = Math.round(rate / expected)
    for (let lag = Math.floor(rate / expected * .95); lag <= Math.ceil(rate / expected * 1.05); lag++) {
      if (correlation(lag) > correlation(best)) best = lag
    }
    const a = correlation(best - 1), b = correlation(best), c = correlation(best + 1)
    const period = best + (a - c) / (2 * (a - 2 * b + c))
    const cents = 1200 * Math.log2(rate / period / expected)
    assert.ok(b > .99)
    assert.ok(Math.abs(cents) < 5, `Pitch error: ${cents.toFixed(2)} cents`)
  })
}
