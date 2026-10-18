import assert from 'node:assert/strict'
import test from 'node:test'
import { getMessages } from '../miniprogram/utils/i18n.ts'

const chinese = { title: '校音器', subtitle: '六弦吉他 · 标准调弦' }
const english = { title: 'Tuner', subtitle: '6-string guitar · Standard tuning' }

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
