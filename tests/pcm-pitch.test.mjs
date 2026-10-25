import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { detectMpmPitch } from '../miniprogram/utils/mpm-pitch.ts'
import { getStringFrequency } from '../miniprogram/utils/tuning-selection.ts'

// The mini program compiler resolves extensionless TS imports; Node does not.
const source = stripTypeScriptTypes(readFileSync(new URL('../miniprogram/utils/pcm-pitch.ts', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace('export function', 'function'))
const createPcmPitchReader = runInNewContext(`${source}\ncreatePcmPitchReader`, { detectMpmPitch })

test('signed little-endian limits normalize without overflow or sign loss', () => {
  let captured
  const create = runInNewContext(`${source}\ncreatePcmPitchReader`, {
    detectMpmPitch: samples => { captured = Array.from(samples); return null },
  })
  const buffer = new ArrayBuffer(8192)
  const view = new DataView(buffer)
  const values = [-32768, -1, 0, 1, 32767]
  values.forEach((value, index) => view.setInt16(index * 2, value, true))
  create(() => {}).push(buffer)
  assert.deepEqual(captured.slice(0, values.length), values.map(value => value / 32768))
})

function tone(frequency, harmonic = 0, length = 4096) {
  const buffer = new ArrayBuffer(length * 2)
  const data = new DataView(buffer)
  for (let i = 0; i < length; i++) {
    const phase = 2 * Math.PI * frequency * i / 16000
    data.setInt16(i * 2, Math.round(24000 * (Math.sin(phase) + harmonic * Math.sin(2 * phase)) / (1 + harmonic)), true)
  }
  return buffer
}

for (const number of [6, 5, 4, 3, 2, 1]) {
  test(`PCM string ${number} detects a tone with ordinary harmonics`, () => {
    const readings = []
    const reader = createPcmPitchReader(value => readings.push(value))
    const expected = getStringFrequency(number)
    const buffer = tone(expected, .5)
    reader.push(buffer.slice(0, 4096))
    assert.equal(readings.length, 0)
    reader.push(buffer.slice(4096))
    assert.equal(readings.length, 1)
    assert.ok(Math.abs(1200 * Math.log2(readings[0] / expected)) < 2)
  })
}

test('PCM uses MPM for a dominant high E mixed with a weak low E', () => {
  const low = getStringFrequency(6), high = getStringFrequency(1)
  const buffer = new ArrayBuffer(8192), data = new DataView(buffer)
  for (let i = 0; i < 4096; i++) data.setInt16(i * 2, Math.round(32767 *
    (.08 * Math.sin(2 * Math.PI * low * i / 16000) + .64 * Math.sin(2 * Math.PI * high * i / 16000))), true)
  const readings = []
  const reader = createPcmPitchReader((frequency, state) => readings.push({ frequency, state }))
  reader.push(buffer)
  assert.ok(Math.abs(1200 * Math.log2(readings[0].frequency / high)) < 2)
  assert.equal(readings[0].state, 'tone')
})

test('arbitrary byte boundaries and multiple windows preserve all samples', () => {
  const readings = []
  const reader = createPcmPitchReader(value => readings.push(value))
  const buffer = tone(110, 0, 8192)
  reader.push(new ArrayBuffer(0))
  for (let offset = 0; offset < buffer.byteLength; offset += 333) reader.push(buffer.slice(offset, offset + 333))
  assert.equal(readings.length, 2)
  for (const value of readings) assert.ok(Math.abs(1200 * Math.log2(value / 110)) < 2)
})

test('PCM does not force a pure high E down two octaves', () => {
  let frequency
  const reader = createPcmPitchReader(value => { frequency = value })
  reader.push(tone(getStringFrequency(1)))
  assert.ok(Math.abs(1200 * Math.log2(frequency / getStringFrequency(1))) < 2)
})

test('reset discards partial samples and bytes from the previous session', () => {
  const readings = []
  const reader = createPcmPitchReader(value => readings.push(value))
  reader.push(tone(82).slice(0, 4097))
  reader.reset()
  reader.push(tone(110))
  assert.equal(readings.length, 1)
  assert.ok(Math.abs(1200 * Math.log2(readings[0] / 110)) < 2)
  reader.push(new ArrayBuffer(8192))
  assert.equal(readings.at(-1), null)
})

test('PCM distinguishes a reliable tone, silence and unreliable noise', () => {
  const states = []
  const reader = createPcmPitchReader((frequency, state) => states.push(state))
  reader.push(tone(110))
  reader.push(new ArrayBuffer(8192))
  let seed = 7
  const noise = new ArrayBuffer(8192)
  const data = new DataView(noise)
  for (let i = 0; i < 4096; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data.setInt16(i * 2, (seed >>> 16) - 32768, true)
  }
  reader.push(noise)
  assert.deepEqual(states, ['tone', 'silent', 'uncertain'])
})
