import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

for (const unavailable of [false, true]) {
  test(`launch does not log in or write template history with storage unavailable=${unavailable}`, () => {
    const calls = []
    let registered = false
    const source = stripTypeScriptTypes(readFileSync(new URL('../miniprogram/app.ts', import.meta.url), 'utf8'))
    runInNewContext(source, {
      App(options) { registered = true; options.onLaunch?.call(options) },
      wx: {
        getStorageSync() {
          calls.push('read')
          if (unavailable) throw new Error('Storage unavailable')
          return []
        },
        setStorageSync() { calls.push('write') },
        login(options) { calls.push('login'); options.success({ code: 'temporary-code' }) },
      },
      console: { log() { calls.push('log') } },
    })
    assert.equal(registered, true)
    assert.deepEqual(calls, [])
  })
}
