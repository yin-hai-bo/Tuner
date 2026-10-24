import assert from 'node:assert/strict'
import test from 'node:test'
import { getPitchReading, getStringFrequency } from '../miniprogram/utils/tuning-selection.ts'

const tuning = [[6, 'E', 82.406889], [5, 'A', 110], [4, 'D', 146.832384],
  [3, 'G', 195.997718], [2, 'B', 246.941651], [1, 'E', 329.627557]]

for (const [number, note, frequency] of tuning) {
  test(`standard string ${number} is identified as ${note} with zero deviation`, () => {
    const reading = getPitchReading(frequency)
    assert.deepEqual(reading.target, { number, note })
    assert.ok(Math.abs(getStringFrequency(number) - frequency) < .001)
    assert.ok(Math.abs(reading.cents) < .001)
  })
  test(`sharp and flat string ${number} retain the target with signed cents`, () => {
    for (const cents of [-40, -5, 5, 40]) {
      const reading = getPitchReading(frequency * 2 ** (cents / 1200))
      assert.equal(reading.target.number, number)
      assert.ok(Math.abs(reading.cents - cents) < .001)
    }
  })
}

test('automatic selection uses musical distance around the boundary between strings', () => {
  const boundary = Math.sqrt(110 * 146.832384)
  assert.equal(getPitchReading(boundary * 2 ** (-1 / 1200)).target.number, 5)
  assert.equal(getPitchReading(boundary * 2 ** (1 / 1200)).target.number, 4)
})

test('manual selection keeps the requested target even when another string is sounding', () => {
  const automatic = getPitchReading(110)
  const manual = getPitchReading(110, 6)
  assert.equal(automatic.target.number, 5)
  assert.equal(manual.target.number, 6)
  assert.ok(Math.abs(manual.cents - 500) < .001)
  assert.ok(Math.abs(getPitchReading(82.406889, 5).cents + 500) < .001)
})

for (const frequency of [0, -1, NaN, Infinity, -Infinity]) {
  test(`invalid frequency ${frequency} yields no reading`, () => {
    assert.equal(getPitchReading(frequency), null)
    assert.equal(getPitchReading(frequency, 6), null)
  })
}

for (const number of [0, 7, -1, 1.5, NaN, Infinity]) {
  test(`invalid manual string ${number} does not silently switch to automatic selection`, () => {
    assert.equal(getPitchReading(110, number), null)
    assert.equal(getStringFrequency(number), null)
  })
}
