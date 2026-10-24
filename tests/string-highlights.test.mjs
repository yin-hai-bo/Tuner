import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const base = readFileSync(new URL('../miniprogram/assets/guitar-headstock.svg', import.meta.url), 'utf8')
test('peg highlight uses the chrome face contour instead of a rectangular background', () => {
  const svg = readFileSync(new URL('../miniprogram/assets/tuning-peg-highlight.svg', import.meta.url), 'utf8')
  const face = base.match(/<path d="([^"]+)" fill="url\(#chrome\)"/)[1]
  assert.ok(svg.includes(`d="${face}"`))
  assert.ok(svg.includes('viewBox="68 -29 70 58"'))
  const css = readFileSync(new URL('../miniprogram/pages/index/index.wxss', import.meta.url), 'utf8')
  for (const state of ['selected', 'detected']) {
    const rules = css.match(new RegExp(`\\.tuning-peg\\.${state} \\{([^}]+)\\}`))?.[1] || ''
    assert.doesNotMatch(rules, /background:|box-shadow:/)
    assert.ok(css.includes(`.tuning-peg.${state} .tuning-peg-highlight`))
  }
  const template = readFileSync(new URL('../miniprogram/pages/index/index.wxml', import.meta.url), 'utf8')
  assert.equal([...template.matchAll(/<image class="tuning-peg-highlight" src="\/assets\/tuning-peg-highlight\.svg"/g)].length, 2)
  assert.match(css, /\.tuners\.right \.tuning-peg-highlight\s*\{\s*transform: scaleX\(-1\)/)
})

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
