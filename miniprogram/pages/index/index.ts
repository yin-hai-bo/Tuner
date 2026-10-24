import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

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
  },
  lifetimes: {
    detached() {
      this.stopReference()
    },
  },
  pageLifetimes: {
    hide() {
      this.stopReference()
    },
    show() {
      let savedLanguage: unknown
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      const messages = getMessages(getPreferredLanguage(savedLanguage, wx.getSystemInfoSync().language))
      this.setData({ messages })
      this.updatePluckHint()
      wx.setNavigationBarTitle({ title: messages.title })
      wx.setTabBarItem({ index: 0, text: messages.tune })
      wx.setTabBarItem({ index: 1, text: messages.settings })
    },
  },
  methods: {
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
    },
    toggleAutomatic(event: WechatMiniprogram.SwitchChange) {
      const selection = event.detail.value
        ? useAutomaticSelection()
        : selectString(this.data.selection, 6)
      this.setData({ selection })
      this.updatePluckHint()
      if (event.detail.value) this.stopReference()
      else this.playReference(6)
    },
  },
})
