import assert from 'node:assert/strict'
import test from 'node:test'
import { createStableTuningConfirmation } from '../miniprogram/utils/stable-tuning.ts'

test('requires 250ms, including both ±3 cent boundaries and natural fluctuation', () => {
  const confirm = createStableTuningConfirmation()
  assert.equal(confirm(6, -3, 0), false)
  assert.equal(confirm(6, 1, 125), false)
  assert.equal(confirm(6, 3, 249), false)
  assert.equal(confirm(6, 0, 250), true)
  assert.equal(confirm(6, -1, 600), true)
})

for (const cents of [-3.001, 3.001, NaN, Infinity]) {
  test(`a deviation of ${cents} interrupts confirmation even after tuning was confirmed`, () => {
    const confirm = createStableTuningConfirmation()
    confirm(6, 0, 0)
    assert.equal(confirm(6, 0, 500), true)
    assert.equal(confirm(6, cents, 600), false)
    assert.equal(confirm(6, 0, 700), false)
    assert.equal(confirm(6, 0, 949), false)
    assert.equal(confirm(6, 0, 950), true)
  })
}

test('silence, unreliable input and target changes reset the stable interval', () => {
  const confirm = createStableTuningConfirmation()
  confirm(6, 0, 0)
  assert.equal(confirm(null, 0, 499), false)
  assert.equal(confirm(6, 0, 500), false)
  assert.equal(confirm(5, 0, 999), false)
  assert.equal(confirm(5, 0, 1248), false)
  assert.equal(confirm(5, 0, 1249), true)
})

test('a backwards clock restarts the stable interval', () => {
  const confirm = createStableTuningConfirmation()
  confirm(1, 0, 1000)
  assert.equal(confirm(1, 0, 900), false)
  assert.equal(confirm(1, 0, 1149), false)
  assert.equal(confirm(1, 0, 1150), true)
})
