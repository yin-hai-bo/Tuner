import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const base = readFileSync(new URL('../miniprogram/assets/guitar-headstock.svg', import.meta.url), 'utf8')
for (const number of [1, 2, 3, 4, 5, 6]) {
  test(`highlight ${number} follows only the matching string on the headstock`, () => {
    const svg = readFileSync(new URL(`../miniprogram/assets/string-highlights/string-${number}.svg`, import.meta.url), 'utf8')
    assert.ok(svg.includes('viewBox="0 0 560 720"'))
    const expected = base.match(new RegExp(`id="string-${number}" d="([^"]+)"`))[1]
    const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)]
    assert.equal(paths.length, 2)
    for (const path of paths) assert.equal(path[1], expected)
  })
}
