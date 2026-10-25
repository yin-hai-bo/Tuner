import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the usage notice remains directly readable below the language choices', () => {
  const template = readFileSync(new URL('../miniprogram/pages/settings/settings.wxml', import.meta.url), 'utf8')
  const notice = template.slice(template.indexOf('<view class="usage-notice">'))
  assert.ok(template.indexOf('<view class="usage-notice">') > template.indexOf('</radio-group>'))
  assert.ok(notice.includes('{{messages.disclaimerTitle}}'))
  assert.ok(notice.includes('<template is="usage-notice" data="{{messages: messages}}" />'))
  assert.doesNotMatch(notice, /wx:if|hidden=/)
})

test('both pages import the same notice template and styles without a runtime component', () => {
  for (const page of ['index', 'settings']) {
    const config = JSON.parse(readFileSync(new URL(`../miniprogram/pages/${page}/${page}.json`, import.meta.url), 'utf8'))
    assert.equal(config.usingComponents['usage-notice'], undefined)
    const template = readFileSync(new URL(`../miniprogram/pages/${page}/${page}.wxml`, import.meta.url), 'utf8')
    const styles = readFileSync(new URL(`../miniprogram/pages/${page}/${page}.wxss`, import.meta.url), 'utf8')
    assert.ok(template.includes('<import src="../../templates/usage-notice.wxml" />'))
    assert.ok(template.includes('<template is="usage-notice" data="{{messages: messages}}" />'))
    assert.ok(styles.includes('@import "../../templates/usage-notice.wxss";'))
  }
  const body = readFileSync(new URL('../miniprogram/templates/usage-notice.wxml', import.meta.url), 'utf8')
  assert.match(body, /<template name="usage-notice">/)
  assert.equal((body.match(/<view class="usage-paragraph/g) || []).length, 5)
  for (const key of ['disclaimerFree', 'disclaimerAutomaticTitle', 'disclaimerManualTitle']) {
    assert.ok(body.includes(`<text class="usage-emphasis">{{messages.${key}}}</text>`))
  }
  for (const key of ['disclaimerIntro', 'disclaimerReference', 'disclaimerAutomatic', 'disclaimerManual', 'disclaimerRisk', 'disclaimerLiability']) {
    assert.ok(body.includes(`{{messages.${key}}}`))
  }
})

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
