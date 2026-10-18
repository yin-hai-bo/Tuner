import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'

Component({
  data: {
    messages: getMessages('en'),
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
      wx.setNavigationBarTitle({ title: messages.title })
    },
  },
  methods: {
    selectTuner(event: WechatMiniprogram.TouchEvent) {
      const number = event.currentTarget.dataset.number
      if (typeof number !== 'number') return
      this.setData({ selection: selectString(this.data.selection, number) })
    },
    selectAutomatic() {
      this.setData({ selection: useAutomaticSelection() })
    },
    openSettings() {
      wx.navigateTo({ url: '/pages/settings/settings' })
    },
  },
})
