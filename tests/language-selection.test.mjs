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
  const audioLog = [], audios = [], toasts = []
  runInNewContext(source, {
    getMessages, getPreferredLanguage,
    selectString, standardTuning, useAutomaticSelection,
    Component: value => { definition = value },
    wx: {
      createInnerAudioContext: () => {
        const audio = {
          src: '',
          play() { audioLog.push(`play:${this.src}`) },
          stop() { audioLog.push('stop') },
          destroy() { audioLog.push('destroy') },
          onEnded(callback) { this.ended = callback },
          onPlay(callback) { this.started = callback },
          onError(callback) { this.error = callback },
        }
        audios.push(audio)
        return audio
      },
      showToast: options => { toasts.push(options.title) },
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
  const hide = () => definition.pageLifetimes.hide.call(page)
  const detach = () => definition.lifetimes.detached.call(page)
  return { page, show, hide, detach, getTitle: () => title, tabs, audioLog, audios, toasts }
}

test('tapping a peg replays from the start and switching strings replaces the previous sound', () => {
  const { page, audioLog, audios } = createPage(new Map(), false, 'en', 'index')
  assert.equal(audios.length, 0)
  for (const number of [6, 6, 1]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
  }
  assert.deepEqual(audioLog, [
    'play:/assets/tones/string-6.wav', 'stop', 'destroy',
    'play:/assets/tones/string-6.wav', 'stop', 'destroy', 'play:/assets/tones/string-1.wav',
  ])
  audios[0].ended()
  audios[0].error()
  assert.equal(audioLog.length, 7, 'Stale callbacks must not stop the newest sound')
  for (const number of [undefined, '1', 0, 7]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
  }
  assert.equal(audios.length, 3)
})

for (const action of ['hide', 'detach', 'ended', 'auto']) {
  test(`${action} releases the reference sound`, () => {
    const state = createPage(new Map(), false, 'en', 'index')
    state.page.toggleAutomatic({ detail: { value: false } })
    assert.equal(state.audios[0].src, '/assets/tones/string-6.wav')
    state.audios[0].started()
    assert.equal(state.page.data.pluckHint, 'Calibrating string 6 (E)')
    if (action === 'auto') state.page.toggleAutomatic({ detail: { value: true } })
    else if (action === 'ended') state.audios[0].ended()
    else state[action]()
    assert.deepEqual(state.audioLog, ['play:/assets/tones/string-6.wav', 'stop', 'destroy'])
    assert.equal(state.page.data.isReferencePlaying, false)
    assert.equal(state.page.data.highlightedStrings.length, 0)
    assert.equal(state.page.data.pluckHint, action === 'auto' ? 'Pluck a single string' : 'Pluck string 6 (E)')
    state.hide()
    assert.equal(state.audioLog.length, 3)
  })
}

test('audio errors preserve selection, release the player and allow retry', () => {
  const { page, audios, toasts, audioLog } = createPage(new Map(), false, 'zh_CN', 'index')
  page.selectTuner({ currentTarget: { dataset: { number: 4 } } })
  audios[0].started()
  audios[0].error()
  assert.equal(page.data.selection.target.number, 4)
  assert.equal(page.data.pluckHint, '请拨动第 4 弦 (D)')
  assert.equal(page.data.highlightedStrings.length, 0)
  assert.deepEqual(toasts, ['参考音播放失败，请重试'])
  assert.deepEqual(audioLog.slice(-2), ['stop', 'destroy'])
  page.selectTuner({ currentTarget: { dataset: { number: 4 } } })
  assert.equal(audios.length, 2)
})

test('string highlighting starts with playback and restarts for repeated taps', () => {
  const { page, audios } = createPage(new Map(), false, 'zh_CN', 'index')
  let previousId = 0
  for (const number of [6, 6, 5, 4, 3, 2, 1]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    assert.equal(page.data.highlightedStrings.length, 0)
    audios.at(-1).started()
    assert.equal(page.data.highlightedStrings.length, 1)
    const highlight = page.data.highlightedStrings[0]
    assert.equal(highlight.number, number)
    assert.ok(highlight.id > previousId, 'A new key restarts the fade on every playback')
    previousId = highlight.id
    if (audios.length > 1) {
      audios.at(-2).started()
      audios.at(-2).ended()
      assert.strictEqual(page.data.highlightedStrings[0], highlight)
    }
  }
})

test('reference playback shows the selected string and note, including after language changes', () => {
  const storage = new Map()
  const { page, audios, show } = createPage(storage, false, 'zh_CN', 'index')
  for (const [number, note] of [[6, 'E'], [5, 'A'], [4, 'D'], [3, 'G'], [2, 'B'], [1, 'E']]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    const audio = audios.at(-1)
    audio.started()
    assert.equal(page.data.pluckHint, `正在对第 ${number} 弦 (${note}) 进行校准`)
    if (audios.length > 1) {
      audios.at(-2).started()
      audios.at(-2).ended()
      assert.equal(page.data.pluckHint, `正在对第 ${number} 弦 (${note}) 进行校准`)
    }
  }
  storage.set('preferredLanguage', 'en')
  show()
  assert.equal(page.data.pluckHint, 'Calibrating string 1 (E)')
  audios.at(-1).ended()
  assert.equal(page.data.pluckHint, 'Pluck string 1 (E)')
})

test('home connects all six tuning pegs and clears the target in auto mode', () => {
  const { page, audioLog } = createPage(new Map(), false, 'en', 'index')
  assert.equal(page.data.selection.mode, 'auto')
  assert.equal(page.data.selection.target, null)
  assert.deepEqual(page.data.leftTuners.map(peg => peg.number), [4, 5, 6])
  assert.deepEqual(page.data.rightTuners.map(peg => peg.number), [3, 2, 1])
  for (const [number, note] of [[6, 'E'], [5, 'A'], [4, 'D'], [3, 'G'], [2, 'B'], [1, 'E']]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    assert.deepEqual(page.data.selection, { mode: 'manual', target: { number, note } })
    assert.equal(audioLog.at(-1), `play:/assets/tones/string-${number}.wav`)
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

test('pluck hint follows manual string selection and the auto switch', () => {
  const { page } = createPage(new Map(), false, 'zh_CN', 'index')
  assert.equal(page.data.pluckHint, '请拨动一根琴弦')
  page.toggleAutomatic({ detail: { value: false } })
  assert.equal(page.data.pluckHint, '请拨动第 6 弦 (E)')
  for (const [number, note] of [[1, 'E'], [2, 'B'], [3, 'G'], [4, 'D'], [5, 'A'], [6, 'E']]) {
    page.selectTuner({ currentTarget: { dataset: { number } } })
    assert.equal(page.data.pluckHint, `请拨动第 ${number} 弦 (${note})`)
  }
  page.toggleAutomatic({ detail: { value: true } })
  assert.equal(page.data.pluckHint, '请拨动一根琴弦')
})

test('pluck hint updates language while preserving the selected string', () => {
  const storage = new Map()
  const { page, show } = createPage(storage, false, 'zh_CN', 'index')
  page.selectTuner({ currentTarget: { dataset: { number: 2 } } })
  storage.set('preferredLanguage', 'en')
  show()
  assert.equal(page.data.pluckHint, 'Pluck string 2 (B)')
  page.toggleAutomatic({ detail: { value: true } })
  assert.equal(page.data.pluckHint, 'Pluck a single string')
})

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
