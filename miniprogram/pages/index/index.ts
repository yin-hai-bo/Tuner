import { getMessages, getPreferredLanguage } from '../../utils/i18n'

const languageStorageKey = 'preferredLanguage'

Component({
  data: {
    messages: getMessages('en'),
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
    openSettings() {
      wx.navigateTo({ url: '/pages/settings/settings' })
    },
  },
})
