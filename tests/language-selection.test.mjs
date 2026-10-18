import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { getMessages, getPreferredLanguage } from '../miniprogram/utils/i18n.ts'
import { selectString, standardTuning, useAutomaticSelection } from '../miniprogram/utils/tuning-selection.ts'

function createPage(storage = new Map(), unavailable = false, systemLanguage = 'zh_CN', name = 'settings') {
  const source = stripTypeScriptTypes(
    readFileSync(new URL(`../miniprogram/pages/${name}/${name}.ts`, import.meta.url), 'utf8')
      .replace(/^import .* from .*\r?\n/gm, ''),
  )
  let definition
  let title
  const tabs = []
  runInNewContext(source, {
    getMessages, getPreferredLanguage,
    selectString, standardTuning, useAutomaticSelection,
    Component: value => { definition = value },
    wx: {
      getSystemInfoSync: () => ({ language: systemLanguage }),
      getStorageSync: key => {
        if (unavailable) throw new Error('Storage unavailable')
        return storage.get(key)
      },
      setStorageSync: (key, value) => {
        if (unavailable) throw new Error('Storage unavailable')
        storage.set(key, value)
      },
      setNavigationBarTitle: value => { title = value.title },
      setTabBarItem: value => { tabs[value.index] = value.text },
    },
  })
  const page = {
    ...definition.methods,
    data: { ...definition.data },
    setData(value) { Object.assign(this.data, value) },
  }
  const show = () => definition.pageLifetimes.show.call(page)
  show()
  return { page, show, getTitle: () => title, tabs }
}

test('home connects all six tuning pegs and clears the target in auto mode', () => {
  const { page } = createPage(new Map(), false, 'en', 'index')
  assert.equal(page.data.selection.mode, 'auto')
  assert.equal(page.data.selection.target, null)
  assert.deepEqual(page.data.leftTuners.map(peg => peg.number), [4, 5, 6])
  assert.deepEqual(page.data.rightTuners.map(peg => peg.number), [3, 2, 1])
  for (const [number, note] of [[6, 'E'], [5, 'A'], [4, 'D'], [3, 'G'], [2, 'B'], [1, 'E']]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    assert.deepEqual(page.data.selection, { mode: 'manual', target: { number, note } })
  }
  page.toggleAutomatic({ detail: { value: true } })
  assert.deepEqual(page.data.selection, { mode: 'auto', target: null })
})

test('turning off auto selects string 6 E, just like tapping its tuning peg', () => {
  const { page } = createPage(new Map(), false, 'en', 'index')
  page.toggleAutomatic({ detail: { value: false } })
  assert.deepEqual(page.data.selection, selectString(useAutomaticSelection(), 6))
  page.selectTuner({ currentTarget: { dataset: { number: 4 } } })
  page.toggleAutomatic({ detail: { value: false } })
  assert.deepEqual(page.data.selection, { mode: 'manual', target: { number: 6, note: 'E' } })
  page.toggleAutomatic({ detail: { value: true } })
  assert.deepEqual(page.data.selection, { mode: 'auto', target: null })
})

test('language changes update both tab labels on settings and when showing home', () => {
  const storage = new Map()
  const home = createPage(storage, false, 'zh_CN', 'index')
  const settings = createPage(storage)
  assert.deepEqual(home.tabs, ['校音', '设置'])
  select(settings.page, 'en')
  assert.deepEqual(settings.tabs, ['Tune', 'Settings'])
  home.show()
  assert.deepEqual(home.tabs, ['Tune', 'Settings'])
  select(settings.page, 'system')
  assert.deepEqual(settings.tabs, ['校音', '设置'])
})

test('returning from settings updates language without losing the selected string', () => {
  const storage = new Map()
  const { page, show } = createPage(storage, false, 'zh_CN', 'index')
  page.selectTuner({ currentTarget: { dataset: { number: 6 } } })
  const selection = page.data.selection
  storage.set('preferredLanguage', 'en')
  show()
  assert.equal(page.data.messages.manual, 'Manual')
  assert.strictEqual(page.data.selection, selection)
  for (const number of [undefined, '1', 0, 7]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    assert.strictEqual(page.data.selection, selection)
  }
})

function select(page, language) {
  page.selectLanguage({ detail: { value: language } })
}

test('selection updates text and navigation title and survives a new page', () => {
  const storage = new Map()
  const { page, getTitle } = createPage(storage)
  assert.equal(page.data.preference, 'system')
  assert.equal(getTitle(), '设置')
  select(page, 'en')
  assert.equal(page.data.messages.subtitle, getMessages('en').subtitle)
  assert.equal(getTitle(), 'Settings')
  assert.equal(createPage(storage).page.data.preference, 'en')
  select(page, 'zh-CN')
  assert.equal(getTitle(), '设置')
  assert.equal(createPage(storage).page.data.preference, 'zh-CN')
})

test('unavailable storage still allows language switching', () => {
  const { page, getTitle } = createPage(new Map(), true)
  assert.equal(page.data.preference, 'system')
  select(page, 'en')
  assert.equal(page.data.preference, 'en')
  assert.equal(getTitle(), 'Settings')
})

test('invalid language events do not change or save the preference', () => {
  const storage = new Map()
  const { page } = createPage(storage)
  select(page, 'fr')
  select(page, undefined)
  assert.equal(page.data.preference, 'system')
  assert.equal(storage.size, 0)
})

test('follow system restores system language and updates home when returning', () => {
  const storage = new Map([['preferredLanguage', 'en']])
  const home = createPage(storage, false, 'zh_CN', 'index')
  const { page } = createPage(storage)
  select(page, 'zh-CN')
  home.show()
  assert.equal(home.getTitle(), '校音器')
  select(page, 'en')
  home.show()
  assert.equal(home.getTitle(), 'Tuner')
  select(page, 'system')
  home.show()
  assert.equal(home.getTitle(), '校音器')
  assert.equal(createPage(storage).page.data.preference, 'system')
  assert.equal(createPage(storage, false, 'fr', 'index').getTitle(), 'Tuner')
})

for (const system of ['zh_CN', 'en', 'fr', 'zh_TW']) {
  test(`follow system label follows ${system}, independently of selection`, () => {
    const { page } = createPage(new Map([['preferredLanguage', 'zh-CN']]), false, system)
    const expected = system === 'zh_CN' ? '跟随系统' : 'Follow system'
    assert.equal(page.data.followSystem, expected)
    select(page, 'en')
    assert.equal(page.data.followSystem, expected)
  })
}
