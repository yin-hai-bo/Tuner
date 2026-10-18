import { getMessages, getPreferredLanguage } from '../../utils/i18n'

const languageStorageKey = 'preferredLanguage'

Component({
  data: {
    language: 'en',
    messages: getMessages('en'),
  },
  lifetimes: {
    attached() {
      let savedLanguage: unknown
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      this.applyLanguage(getPreferredLanguage(savedLanguage, wx.getSystemInfoSync().language))
    },
  },
  methods: {
    applyLanguage(language: string) {
      const messages = getMessages(language)
      this.setData({ language, messages })
      wx.setNavigationBarTitle({ title: messages.title })
    },
    selectLanguage(event: WechatMiniprogram.TouchEvent) {
      const language = event.currentTarget.dataset.language
      if (language !== 'zh-CN' && language !== 'en') return
      this.applyLanguage(language)
      try {
        wx.setStorageSync(languageStorageKey, language)
      } catch {
        // The selection still applies to the current page if saving fails.
      }
    },
  },
})
