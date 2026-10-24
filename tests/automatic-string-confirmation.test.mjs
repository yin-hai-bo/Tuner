import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutomaticStringConfirmation } from '../miniprogram/utils/automatic-string-confirmation.ts'

test('the same candidate requires 300ms, then stays confirmed', () => {
  for (const number of [1, 2, 3, 4, 5, 6]) {
    const confirm = createAutomaticStringConfirmation()
    assert.equal(confirm(number, 0), null)
    assert.equal(confirm(number, 299), null)
    assert.equal(confirm(number, 300), number)
    assert.equal(confirm(number, 400), number)
  }
})

test('changing candidates restarts confirmation, including returning to the previous string', () => {
  const confirm = createAutomaticStringConfirmation()
  confirm(6, 0)
  assert.equal(confirm(6, 300), 6)
  assert.equal(confirm(5, 400), null)
  assert.equal(confirm(6, 500), null)
  assert.equal(confirm(6, 799), null)
  assert.equal(confirm(6, 800), 6)
  assert.equal(confirm(5, 900), null)
  assert.equal(confirm(5, 1200), 5)
})

test('unreliable input, silence or a reset breaks continuity', () => {
  const confirm = createAutomaticStringConfirmation()
  confirm(6, 0)
  assert.equal(confirm(null, 299), null)
  assert.equal(confirm(6, 300), null)
  assert.equal(confirm(6, 599), null)
  assert.equal(confirm(6, 600), 6)
  assert.equal(confirm(null, 700), null)
  assert.equal(confirm(6, 1000), null)
})

test('a backwards clock restarts confirmation instead of confirming prematurely', () => {
  const confirm = createAutomaticStringConfirmation()
  confirm(1, 1000)
  assert.equal(confirm(1, 900), null)
  assert.equal(confirm(1, 1199), null)
  assert.equal(confirm(1, 1200), 1)
})
