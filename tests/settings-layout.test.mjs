import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('each language row keeps its label and native radio bound to the same preference', () => {
  const template = readFileSync(new URL('../miniprogram/pages/settings/settings.wxml', import.meta.url), 'utf8')
  assert.match(template, /<radio-group\b[^>]*bindchange="selectLanguage"/)
  const rows = [...template.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)]
  assert.equal(rows.length, 3)
  for (const [index, value] of ['system', 'zh-CN', 'en'].entries()) {
    const [, attributes, content] = rows[index]
    assert.ok(attributes.includes(`preference === '${value}' ? 'selected' : ''`))
    assert.ok(content.includes(`value="${value}" checked="{{preference === '${value}'}}"`))
    assert.match(content, /<text>.+<\/text>/)
    assert.equal((content.match(/<radio\b/g) || []).length, 1)
  }
})
