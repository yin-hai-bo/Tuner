import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { getMessages, getPreferredLanguage } from '../miniprogram/utils/i18n.ts'

const source = stripTypeScriptTypes(
  readFileSync(new URL('../miniprogram/pages/index/index.ts', import.meta.url), 'utf8')
    .replace(/^import .* from .*\r?\n/, ''),
)

function createPage(storage = new Map(), unavailable = false) {
  let definition
  let title
  runInNewContext(source, {
    getMessages, getPreferredLanguage,
    Component: value => { definition = value },
    wx: {
      getSystemInfoSync: () => ({ language: 'zh_CN' }),
      getStorageSync: key => {
        if (unavailable) throw new Error('Storage unavailable')
        return storage.get(key)
      },
      setStorageSync: (key, value) => {
        if (unavailable) throw new Error('Storage unavailable')
        storage.set(key, value)
      },
      setNavigationBarTitle: value => { title = value.title },
    },
  })
  const page = {
    ...definition.methods,
    data: { ...definition.data },
    setData(value) { Object.assign(this.data, value) },
  }
  definition.lifetimes.attached.call(page)
  return { page, getTitle: () => title }
}

function select(page, language) {
  page.selectLanguage({ currentTarget: { dataset: { language } } })
}

test('selection updates text and navigation title and survives a new page', () => {
  const storage = new Map()
  const { page, getTitle } = createPage(storage)
  assert.equal(page.data.language, 'zh-CN')
  assert.equal(getTitle(), '校音器')
  select(page, 'en')
  assert.equal(page.data.messages.subtitle, getMessages('en').subtitle)
  assert.equal(getTitle(), 'Tuner')
  assert.equal(createPage(storage).page.data.language, 'en')
  select(page, 'zh-CN')
  assert.equal(getTitle(), '校音器')
  assert.equal(createPage(storage).page.data.language, 'zh-CN')
})

test('unavailable storage still allows language switching', () => {
  const { page, getTitle } = createPage(new Map(), true)
  assert.equal(page.data.language, 'zh-CN')
  select(page, 'en')
  assert.equal(page.data.language, 'en')
  assert.equal(getTitle(), 'Tuner')
})

test('invalid language events do not change or save the preference', () => {
  const storage = new Map()
  const { page } = createPage(storage)
  select(page, 'fr')
  select(page, undefined)
  assert.equal(page.data.language, 'zh-CN')
  assert.equal(storage.size, 0)
})
