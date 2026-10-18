import assert from 'node:assert/strict'
import test from 'node:test'
import { selectString, useAutomaticSelection } from '../miniprogram/utils/tuning-selection.ts'

test('automatic mode starts without a target string', () => {
  assert.deepEqual(useAutomaticSelection(), { mode: 'auto', target: null })
})

for (const [number, note] of [[6, 'E'], [5, 'A'], [4, 'D'], [3, 'G'], [2, 'B'], [1, 'E']]) {
  test(`selecting string ${number} locks the standard note ${note} in manual mode`, () => {
    assert.deepEqual(selectString(useAutomaticSelection(), number), {
      mode: 'manual', target: { number, note },
    })
  })
}

test('the two E strings remain distinct manual targets', () => {
  const lowE = selectString(useAutomaticSelection(), 6)
  const highE = selectString(lowE, 1)
  assert.equal(lowE.target.number, 6)
  assert.equal(highE.target.number, 1)
  assert.equal(lowE.target.note, highE.target.note)
})

test('selecting another string replaces the manual target', () => {
  const original = selectString(useAutomaticSelection(), 5)
  const next = selectString(original, 2)
  assert.deepEqual(next, { mode: 'manual', target: { number: 2, note: 'B' } })
  assert.equal(original.target.number, 5)
})

test('selecting the same string keeps the same mode and target', () => {
  const current = selectString(useAutomaticSelection(), 3)
  assert.deepEqual(selectString(current, 3), current)
})

test('returning to automatic mode clears a manually selected target', () => {
  let selection = selectString(useAutomaticSelection(), 4)
  assert.equal(selection.mode, 'manual')
  selection = useAutomaticSelection()
  assert.deepEqual(selection, { mode: 'auto', target: null })
})

for (const number of [0, 7, -1, 1.5, NaN, Infinity]) {
  test(`invalid string number ${number} preserves the current selection`, () => {
    const automatic = useAutomaticSelection()
    const manual = selectString(automatic, 6)
    assert.strictEqual(selectString(automatic, number), automatic)
    assert.strictEqual(selectString(manual, number), manual)
  })
}
