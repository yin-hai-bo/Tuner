import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { getMessages, getPreferredLanguage } from '../miniprogram/utils/i18n.ts'
import { getPitchReading, getStringFrequency, selectString, standardTuning, useAutomaticSelection } from '../miniprogram/utils/tuning-selection.ts'

function createPage(storage = new Map(), unavailable = false, systemLanguage = 'zh_CN', name = 'settings', platform = 'devtools') {
  const source = stripTypeScriptTypes(
    readFileSync(new URL(`../miniprogram/pages/${name}/${name}.ts`, import.meta.url), 'utf8')
      .replace(/^import .* from .*\r?\n/gm, ''),
  )
  let definition
  let title
  const tabs = []
  const audioLog = [], audios = [], toasts = []
  let now = 0, timerId = 0
  const timers = new Map()
  runInNewContext(source, {
    Date: { now: () => now },
    setInterval: callback => { timers.set(++timerId, callback); return timerId },
    clearInterval: id => timers.delete(id),
    getMessages, getPreferredLanguage,
    getPitchReading, getStringFrequency, selectString, standardTuning, useAutomaticSelection,
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
      getSystemInfoSync: () => ({ language: systemLanguage, platform }),
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
  const tick = () => { now += 100; for (const callback of timers.values()) callback() }
  return { page, show, hide, detach, tick, timers, getTitle: () => title, tabs, audioLog, audios, toasts }
}

test('pitch trail samples marker position and color, preserves history and expires old points', () => {
  const { page, tick } = createPage(new Map(), false, 'en', 'index')
  tick()
  assert.equal(page.data.pitchTrail.length, 0)
  page.toggleDebugPanel()
  page.debugChangeCents({ detail: { value: -50 } })
  tick()
  const first = page.data.pitchTrail[0]
  assert.equal(first.offset, page.data.debugOffset)
  assert.equal(first.color, page.data.debugMarkerColor)
  page.debugChangeCents({ detail: { value: 0 } })
  tick()
  assert.equal(page.data.pitchTrail[0], first)
  assert.equal(page.data.pitchTrail[1].color, '#16834b')
  for (let i = 0; i < 210; i++) tick()
  assert.equal(page.data.pitchTrail.length, 200)
  assert.ok(!page.data.pitchTrail.includes(first))
  for (const state of ['silent', 'uncertain']) {
    page.debugSetState({ currentTarget: { dataset: { state } } })
    for (let i = 0; i < 201; i++) tick()
    assert.equal(page.data.pitchTrail.length, 0)
  }
})

test('reference playback suppresses trail samples and page exit clears timers and history', () => {
  const { page, tick, hide, show, detach, timers, audios } = createPage(new Map(), false, 'en', 'index')
  page.toggleDebugPanel()
  page.debugChangeCents({ detail: { value: 5 } })
  tick()
  page.selectTuner({ currentTarget: { dataset: { number: 6 } } })
  audios[0].started()
  tick()
  assert.equal(page.data.pitchTrail.length, 1)
  hide()
  assert.equal(page.data.pitchTrail.length, 0)
  assert.equal(timers.size, 0)
  show()
  show()
  assert.equal(timers.size, 1)
  detach()
  assert.equal(timers.size, 0)
})

test('debug controls simulate all six strings and signed offsets without playing audio', () => {
  const { page, audios } = createPage(new Map(), false, 'zh_CN', 'index')
  assert.equal(page.data.debugEnabled, true)
  assert.equal(page.data.debugOpen, false)
  page.toggleDebugPanel()
  assert.equal(page.data.debugOpen, true)
  for (let index = 0; index < 6; index++) {
    page.debugSelectString({ detail: { value: String(index) } })
    for (const value of [-100, -5, 0, 5, 100]) {
      page.debugChangeCents({ detail: { value } })
      assert.equal(page.data.debugReading.target.number, 6 - index)
      assert.equal(page.data.debugDeviation || 0, value)
      assert.equal(page.data.debugAutoTarget, 6 - index)
      assert.ok(Math.abs(page.data.debugOffset - value * .4) < .001)
      assert.equal(page.data.debugHintKey, value < 0 ? 'pitchLow' : value > 0 ? 'pitchHigh' : 'holdPitch')
    }
  }
  assert.equal(audios.length, 0)
})

test('deviations within two cents use a white outline and green-fill state, including exact boundaries', () => {
  const { page, tick } = createPage(new Map(), false, 'zh_CN', 'index')
  page.toggleDebugPanel()
  for (let index = 0; index < 6; index++) {
    page.debugSelectString({ detail: { value: String(index) } })
    for (const value of [-2, -1, 0, 1, 2]) {
      page.debugChangeCents({ detail: { value } })
      assert.equal(page.data.debugInTune, true)
      assert.equal(page.data.debugMarkerColor, '#f2f5f3')
      assert.equal(page.data.debugHintKey, 'holdPitch')
      tick()
      assert.equal(page.data.pitchTrail.at(-1).color, '#16834b')
    }
    for (const value of [-2.01, 2.01]) {
      page.debugChangeCents({ detail: { value } })
      assert.equal(page.data.debugInTune, false)
      tick()
      assert.equal(page.data.pitchTrail.at(-1).color, page.data.debugMarkerColor)
    }
  }
})

test('marker position and redness increase symmetrically with the deviation magnitude', () => {
  const { page } = createPage(new Map(), false, 'en', 'index')
  page.debugSelectString({ detail: { value: '0' } })
  let previousGreen = 256, previousOffset = 0
  for (const value of [3, 5, 20, 50, 100]) {
    page.debugChangeCents({ detail: { value } })
    const color = page.data.debugMarkerColor
    const green = Number(color.match(/rgb\(244, (\d+),/)[1])
    assert.ok(green <= previousGreen, 'Reducing the green channel shifts yellow toward red')
    assert.ok(page.data.debugOffset > previousOffset)
    previousGreen = green
    previousOffset = page.data.debugOffset
    page.debugChangeCents({ detail: { value: -value } })
    assert.equal(page.data.debugMarkerColor, color)
    assert.ok(Math.abs(page.data.debugOffset + previousOffset) < .001)
  }
  page.debugSetState({ currentTarget: { dataset: { state: 'silent' } } })
  assert.equal(page.data.debugInTune, false)
  assert.equal(page.data.debugMarkerColor, '#f2f5f3')
  assert.equal(page.data.debugOffset, 0)
})

test('debug input respects manual selection and clears on silence, unreliable input, close and hide', () => {
  const { page, hide } = createPage(new Map(), false, 'en', 'index')
  page.toggleDebugPanel()
  page.debugSelectString({ detail: { value: '1' } }) // Sounding string 5 A.
  page.toggleAutomatic({ detail: { value: false } }) // Locked to string 6 E.
  assert.equal(page.data.debugReading.target.number, 6)
  assert.equal(page.data.debugDeviation, 500)
  assert.equal(page.data.debugAutoTarget, 0, 'Manual mode must not flash an automatic candidate')
  assert.equal(page.data.debugOffset, 40, 'Large manual deviations stop at the grid edge')
  page.toggleAutomatic({ detail: { value: true } })
  assert.equal(page.data.debugReading.target.number, 5)
  for (const state of ['silent', 'uncertain']) {
    page.debugSetState({ currentTarget: { dataset: { state } } })
    assert.equal(page.data.debugState, state)
    assert.equal(page.data.debugReading, null)
    assert.equal(page.data.debugFrequency, '')
    assert.equal(page.data.debugAutoTarget, 0)
    assert.equal(page.data.debugOffset, 0)
  }
  page.debugSetState({ currentTarget: { dataset: { state: 'tone' } } })
  page.toggleDebugPanel()
  assert.equal(page.data.debugReading, null)
  assert.equal(page.data.debugAutoTarget, 0)
  page.debugSelectString({ detail: { value: '0' } })
  hide()
  assert.equal(page.data.debugReading, null)
  assert.equal(page.data.debugAutoTarget, 0)
})

for (const platform of ['ios', 'android', 'windows']) {
  test(`debug controls are hidden and inactive on ${platform}`, () => {
    const { page } = createPage(new Map(), false, 'en', 'index', platform)
    page.toggleDebugPanel()
    page.debugSelectString({ detail: { value: '1' } })
    page.debugChangeCents({ detail: { value: 5 } })
    page.debugSetState({ currentTarget: { dataset: { state: 'tone' } } })
    assert.equal(page.data.debugEnabled, false)
    assert.equal(page.data.debugOpen, false)
    assert.equal(page.data.debugReading, null)
  })
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
