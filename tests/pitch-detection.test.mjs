import assert from 'node:assert/strict'
import test from 'node:test'
import { detectPitch } from '../miniprogram/utils/pitch-detection.ts'
import { getPitchReading, getStringFrequency } from '../miniprogram/utils/tuning-selection.ts'

function tone(frequency, sampleRate, harmonics = [1], phase = .37) {
  const total = harmonics.reduce((sum, amplitude) => sum + Math.abs(amplitude), 0)
  return Float32Array.from({ length: 4096 }, (_, i) =>
    harmonics.reduce((sum, amplitude, index) => sum + amplitude *
      Math.sin(2 * Math.PI * frequency * (index + 1) * i / sampleRate + phase), 0) / total * .8)
}

for (const sampleRate of [16000, 44100, 48000]) {
  for (const number of [6, 5, 4, 3, 2, 1]) {
    for (const harmonics of [[1], [1, 3], [1, 10], [1, 5, .5, .3]]) {
      test(`string ${number}, ${sampleRate}Hz, harmonic amplitudes ${harmonics}`, () => {
        const expected = getStringFrequency(number)
        const frequency = detectPitch(tone(expected, sampleRate, harmonics), sampleRate)
        assert.notEqual(frequency, null)
        assert.ok(Math.abs(1200 * Math.log2(frequency / expected)) < 2, `Detected ${frequency}Hz`)
        assert.equal(getPitchReading(frequency).target.number, number)
      })
    }
  }
}

test('detuned fundamentals remain detuned, rather than being snapped to standard tuning', () => {
  for (const number of [6, 5, 4, 3, 2, 1]) {
    for (const cents of [-100, -20, 20, 100]) {
      const expected = getStringFrequency(number) * 2 ** (cents / 1200)
      const frequency = detectPitch(tone(expected, 16000, [1, 8]), 16000)
      assert.notEqual(frequency, null)
      assert.ok(Math.abs(getPitchReading(frequency, number).cents - cents) < 2)
    }
  }
})

test('a genuine octave-up tone stays high when no lower fundamental is present', () => {
  const expected = getStringFrequency(6) * 2
  const frequency = detectPitch(tone(expected, 16000), 16000)
  assert.ok(Math.abs(1200 * Math.log2(frequency / expected)) < 2)
})

test('decay, phase, gain, DC offset and light noise do not cause an octave jump', () => {
  for (const phase of [0, .5, 2]) {
    for (const number of [6, 5, 4, 3, 2, 1]) {
      const expected = getStringFrequency(number)
      const samples = tone(expected, 16000, [1, 6, .5], phase)
      let seed = 17
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        samples[i] = .15 + samples[i] * .5 * Math.exp(-i / 6000) + (seed / 2 ** 32 - .5) * .002
      }
      const frequency = detectPitch(samples, 16000)
      assert.notEqual(frequency, null)
      assert.ok(Math.abs(1200 * Math.log2(frequency / expected)) < 2)
    }
  }
})

test('out-of-range pure tones are rejected rather than folded into the guitar range', () => {
  for (const frequency of [50, 440, 660, 880]) {
    assert.equal(detectPitch(tone(frequency, 16000), 16000), null)
  }
})

test('silence, constant input, short frames and invalid PCM are rejected', () => {
  for (const samples of [new Float32Array(4096), new Float32Array(4096).fill(.2),
    new Float32Array(32), new Float32Array(4096).fill(NaN),
    new Float32Array(4096).fill(Infinity), new Float32Array(4096).fill(2)]) {
    assert.equal(detectPitch(samples, 16000), null)
  }
  for (const sampleRate of [0, -1, NaN, Infinity, 7999]) {
    assert.equal(detectPitch(tone(110, 16000), sampleRate), null)
  }
})

test('deterministic broadband noise produces no reliable pitch', () => {
  let seed = 7
  const samples = Float32Array.from({ length: 4096 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32 - .5
  })
  assert.equal(detectPitch(samples, 16000), null)
})
