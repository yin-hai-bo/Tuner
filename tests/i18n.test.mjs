import assert from 'node:assert/strict'
import test from 'node:test'
import { getMessages, getPreferredLanguage } from '../miniprogram/utils/i18n.ts'

const chinese = { title: '校音器', tune: '校音', subtitle: '六弦吉他 · 标准调弦', settings: '设置', language: '语言', followSystem: '跟随系统', automatic: '自动', manual: '手动', string: '琴弦', chooseString: '点击弦钮选择琴弦' }
const english = { title: 'Tuner', tune: 'Tune', subtitle: '6-string guitar · Standard tuning', settings: 'Settings', language: 'Language', followSystem: 'Follow system', automatic: 'Auto', manual: 'Manual', string: 'String', chooseString: 'Tap a tuning peg to select a string' }

test('a saved selection overrides the system language', () => {
  assert.equal(getPreferredLanguage('en', 'zh_CN'), 'en')
  assert.equal(getPreferredLanguage('zh-CN', 'en'), 'zh-CN')
})

for (const saved of ['system', undefined, null, '', 'fr', 'zh', 42, {}]) {
  test(`preference ${JSON.stringify(saved)} resolves using the system language`, () => {
    assert.equal(getPreferredLanguage(saved, 'zh_CN'), 'zh-CN')
    assert.equal(getPreferredLanguage(saved, 'en'), 'en')
    assert.equal(getPreferredLanguage(saved, 'ja'), 'en')
  })
}

for (const language of ['zh', 'zh_CN', 'zh-CN', 'ZH_cn']) {
  test(`${language} uses Simplified Chinese`, () => {
    assert.deepEqual(getMessages(language), chinese)
  })
}

for (const language of ['en', 'en_US', 'en-GB']) {
  test(`${language} uses English`, () => {
    assert.deepEqual(getMessages(language), english)
  })
}

for (const language of ['fr', 'ja', 'zh_TW', 'zh_HK', '']) {
  test(`${language || 'empty language'} falls back to English`, () => {
    assert.deepEqual(getMessages(language), english)
  })
}
