import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { getPitchReading, getStringFrequency, selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'
let referenceAudio: WechatMiniprogram.InnerAudioContext | undefined

Component({
  data: {
    messages: getMessages('en'),
    pluckHint: getMessages('en').pluckString,
    isReferencePlaying: false,
    referencePlaybackId: 0,
    highlightedStrings: [] as { id: number; number: number }[],
    selection: useAutomaticSelection(),
    leftTuners: standardTuning.slice(0, 3).reverse(),
    rightTuners: standardTuning.slice(3),
    debugEnabled: false,
    debugOpen: false,
    debugStrings: standardTuning.map(string => `${string.number} · ${string.note}`),
    debugIndex: 0,
    debugCents: 0,
    debugState: 'silent' as 'tone' | 'silent' | 'uncertain',
    debugFrequency: '',
    debugReading: null as ReturnType<typeof getPitchReading>,
    debugDeviation: 0,
    debugOffset: 0,
    debugInTune: false,
    debugMarkerColor: '#f2f5f3',
    debugAutoTarget: 0,
    debugHintKey: 'pluckString',
  },
  lifetimes: {
    detached() {
      this.stopReference()
    },
  },
  pageLifetimes: {
    hide() {
      this.stopReference()
      this.updateDebugReading('silent')
    },
    show() {
      let savedLanguage: unknown
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      const system = wx.getSystemInfoSync()
      const messages = getMessages(getPreferredLanguage(savedLanguage, system.language))
      this.setData({ messages, debugEnabled: system.platform === 'devtools' })
      this.updatePluckHint()
      wx.setNavigationBarTitle({ title: messages.title })
      wx.setTabBarItem({ index: 0, text: messages.tune })
      wx.setTabBarItem({ index: 1, text: messages.settings })
    },
  },
  methods: {
    toggleDebugPanel() {
      if (!this.data.debugEnabled) return
      this.setData({ debugOpen: !this.data.debugOpen })
      if (!this.data.debugOpen) this.updateDebugReading('silent')
    },
    updateDebugReading(state: 'tone' | 'silent' | 'uncertain') {
      if (!this.data.debugEnabled) return
      const { debugIndex, debugCents, selection } = this.data
      const base = getStringFrequency(standardTuning[debugIndex].number)!
      const frequency = base * 2 ** (debugCents / 1200)
      const reading = state === 'tone'
        ? getPitchReading(frequency, selection.mode === 'manual' ? selection.target.number : undefined)
        : null
      const cents = reading ? Math.round(reading.cents) : 0
      const distance = reading ? Math.abs(reading.cents) : 0
      // Allow only negligible floating-point error at the exact 2-cent boundary.
      const debugInTune = reading !== null && distance <= 2 + 1e-7
      const redness = Math.max(0, Math.min(1, (distance - 2) / 98))
      const debugMarkerColor = !reading || debugInTune ? '#f2f5f3'
        : `rgb(244, ${Math.round(200 - 130 * redness)}, ${Math.round(78 - 8 * redness)})`
      const debugHintKey = !reading ? 'unreliableInput'
        : debugInTune ? 'holdPitch' : reading.cents < 0 ? 'pitchLow' : 'pitchHigh'
      this.setData({ debugState: state, debugFrequency: state === 'tone' ? frequency.toFixed(3) : '',
        debugReading: reading, debugDeviation: cents,
        debugOffset: reading ? Math.max(-40, Math.min(40, reading.cents * .4)) : 0,
        debugAutoTarget: reading && selection.mode === 'auto' ? reading.target.number : 0,
        debugHintKey, debugInTune, debugMarkerColor })
    },
    debugSelectString(event: WechatMiniprogram.PickerChange) {
      const index = Number(event.detail.value)
      if (!this.data.debugEnabled || !Number.isInteger(index) || index < 0 || index >= standardTuning.length) return
      this.setData({ debugIndex: index })
      this.updateDebugReading('tone')
    },
    debugChangeCents(event: WechatMiniprogram.SliderChange) {
      const cents = event.detail.value
      if (!this.data.debugEnabled || !Number.isFinite(cents) || cents < -100 || cents > 100) return
      this.setData({ debugCents: cents })
      this.updateDebugReading('tone')
    },
    debugSetState(event: WechatMiniprogram.TouchEvent) {
      const state = event.currentTarget.dataset.state
      if (state === 'tone' || state === 'silent' || state === 'uncertain') this.updateDebugReading(state)
    },
    stopReference() {
      const audio = referenceAudio
      referenceAudio = undefined
      if (audio) {
        audio.stop()
        audio.destroy()
      }
      if (this.data.isReferencePlaying) {
        this.setData({ isReferencePlaying: false, highlightedStrings: [] })
        this.updatePluckHint()
      }
    },
    playReference(number: number) {
      this.stopReference()
      const audio = wx.createInnerAudioContext()
      referenceAudio = audio
      audio.onPlay(() => {
        if (referenceAudio !== audio) return
        const id = this.data.referencePlaybackId + 1
        this.setData({
          isReferencePlaying: true,
          referencePlaybackId: id,
          highlightedStrings: [{ id, number }],
        })
        this.updatePluckHint()
      })
      audio.onEnded(() => {
        if (referenceAudio === audio) this.stopReference()
      })
      audio.onError(() => {
        if (referenceAudio !== audio) return
        this.stopReference()
        wx.showToast({ title: this.data.messages.referenceUnavailable, icon: 'none' })
      })
      audio.src = `/assets/tones/string-${number}.wav`
      audio.play()
    },
    updatePluckHint() {
      const { selection, messages, isReferencePlaying } = this.data
      const manualHint = isReferencePlaying ? messages.calibratingString : messages.pluckSelectedString
      const pluckHint = selection.mode === 'manual'
        ? manualHint
          .replace('{number}', String(selection.target.number))
          .replace('{note}', selection.target.note)
        : messages.pluckString
      this.setData({ pluckHint })
    },
    selectTuner(event: WechatMiniprogram.TouchEvent) {
      const number = event.currentTarget.dataset.number
      if (typeof number !== 'number') return
      const selection = selectString(this.data.selection, number)
      if (selection === this.data.selection) return
      this.setData({ selection })
      this.updatePluckHint()
      this.playReference(number)
      this.updateDebugReading(this.data.debugState)
    },
    toggleAutomatic(event: WechatMiniprogram.SwitchChange) {
      const selection = event.detail.value
        ? useAutomaticSelection()
        : selectString(this.data.selection, 6)
      this.setData({ selection })
      this.updatePluckHint()
      if (event.detail.value) this.stopReference()
      else this.playReference(6)
      this.updateDebugReading(this.data.debugState)
    },
  },
})
