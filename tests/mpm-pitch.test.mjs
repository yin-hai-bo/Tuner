import assert from 'node:assert/strict'
import test from 'node:test'
import { detectMpmPitch } from '../miniprogram/utils/mpm-pitch.ts'
import { detectPitch } from '../miniprogram/utils/pitch-detection.ts'
import { getStringFrequency } from '../miniprogram/utils/tuning-selection.ts'

function signal(rate, partials, phase = .37) {
  return Float32Array.from({ length: 4096 }, (_, i) => partials.reduce((sum, [frequency, amplitude]) =>
    sum + amplitude * Math.sin(2 * Math.PI * frequency * i / rate + phase), 0))
}

for (const rate of [16000, 44100, 48000]) {
  for (const number of [1, 2, 3, 4, 5, 6]) {
    test(`MPM interpolates string ${number} at ${rate}Hz to within two cents`, () => {
      for (const cents of [-30, 0, 30]) {
        for (const phase of [0, .7]) {
          const expected = getStringFrequency(number) * 2 ** (cents / 1200)
          const result = detectMpmPitch(signal(rate, [[expected, .4], [expected * 2, .2], [expected * 3, .1]], phase), rate)
          assert.notEqual(result, null)
          assert.ok(Math.abs(1200 * Math.log2(result.frequency / expected)) < 2)
          assert.ok(result.clarity >= .75 && result.clarity <= 1)
        }
      }
    })
  }
}

test('a strong high E is not replaced by the weak low E mixed with it', () => {
  const low = getStringFrequency(6), high = getStringFrequency(1)
  // This signal can also be a low E with a strong fourth partial; intent needs context.
  const samples = signal(16000, [[low, .08], [high, .64]])
  assert.ok(Math.abs(1200 * Math.log2(detectPitch(samples, 16000) / low)) < 2)
  const result = detectMpmPitch(samples, 16000)
  assert.ok(Math.abs(1200 * Math.log2(result.frequency / high)) < 2)
})

test('MPM rejects invalid samples, silence, DC, short input and out-of-range tones', () => {
  for (const samples of [new Float32Array(4096), new Float32Array(4096).fill(.2),
    new Float32Array(32), new Float32Array(4096).fill(NaN), new Float32Array(4096).fill(Infinity),
    new Float32Array(4096).fill(2), signal(16000, [[110, .0001]])]) {
    assert.equal(detectMpmPitch(samples, 16000), null)
  }
  for (const rate of [0, -1, 7999, NaN, Infinity]) assert.equal(detectMpmPitch(signal(16000, [[110, .5]]), rate), null)
  for (const frequency of [50, 440, 660, 880]) assert.equal(detectMpmPitch(signal(16000, [[frequency, .5]]), 16000), null)
})

test('MPM tolerates DC, decay and small noise but rejects broadband noise', () => {
  let seed = 7
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32 - .5
  })
  assert.equal(detectMpmPitch(noise, 16000), null)
  const samples = signal(16000, [[110, .3], [220, .1]])
  for (let i = 0; i < samples.length; i++) samples[i] = .15 + samples[i] * Math.exp(-i / 6000) + noise[i] * .002
  assert.ok(Math.abs(1200 * Math.log2(detectMpmPitch(samples, 16000).frequency / 110)) < 2)
})

test('MPM distinguishes silence from rejected input and resets the state on each window', () => {
  const input = { silent: false }
  for (const samples of [new Float32Array(4096), new Float32Array(4096).fill(.2)]) {
    assert.equal(detectMpmPitch(samples, 16000, input), null)
    assert.equal(input.silent, true)
    assert.equal(detectMpmPitch(signal(16000, [[440, .5]]), 16000, input), null)
    assert.equal(input.silent, false)
  }
  input.silent = true
  assert.equal(detectMpmPitch(new Float32Array(32), 16000, input), null)
  assert.equal(input.silent, false)
  assert.notEqual(detectMpmPitch(signal(16000, [[110, .5]]), 16000, input), null)
  assert.equal(input.silent, false)
})
