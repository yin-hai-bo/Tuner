import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'

Component({
  data: {
    messages: getMessages('en'),
    pluckHint: getMessages('en').pluckString,
    selection: useAutomaticSelection(),
    leftTuners: standardTuning.slice(0, 3).reverse(),
    rightTuners: standardTuning.slice(3),
  },
  pageLifetimes: {
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
    updatePluckHint() {
      const { selection, messages } = this.data
      const pluckHint = selection.mode === 'manual'
        ? messages.pluckSelectedString
          .replace('{number}', String(selection.target.number))
          .replace('{note}', selection.target.note)
        : messages.pluckString
      this.setData({ pluckHint })
    },
    selectTuner(event: WechatMiniprogram.TouchEvent) {
      const number = event.currentTarget.dataset.number
      if (typeof number !== 'number') return
      this.setData({ selection: selectString(this.data.selection, number) })
      this.updatePluckHint()
    },
    toggleAutomatic(event: WechatMiniprogram.SwitchChange) {
      const selection = event.detail.value
        ? useAutomaticSelection()
        : selectString(this.data.selection, 6)
      this.setData({ selection })
      this.updatePluckHint()
    },
  },
})
