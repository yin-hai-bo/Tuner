import { getMessages, getPreferredLanguage } from '../../utils/i18n'

Component({
  data: {
    preference: 'system',
    messages: getMessages('en'),
    followSystem: 'Follow system',
  },
  pageLifetimes: {
    show() {
      let saved: unknown
      try {
        saved = wx.getStorageSync('preferredLanguage')
      } catch {
        // Use the system language if storage is unavailable.
      }
      this.applyPreference(saved === 'zh-CN' || saved === 'en' ? saved : 'system')
    },
  },
  methods: {
    applyPreference(preference: string) {
      const systemLanguage = wx.getSystemInfoSync().language
      const messages = getMessages(getPreferredLanguage(preference, systemLanguage))
      this.setData({ preference, messages, followSystem: getMessages(systemLanguage).followSystem })
      wx.setNavigationBarTitle({ title: messages.settings })
      wx.setTabBarItem({ index: 0, text: messages.tune })
      wx.setTabBarItem({ index: 1, text: messages.settings })
    },
    selectLanguage(event: WechatMiniprogram.RadioGroupChange) {
      const preference = event.detail.value
      if (preference !== 'system' && preference !== 'zh-CN' && preference !== 'en') return
      this.applyPreference(preference)
      try {
        wx.setStorageSync('preferredLanguage', preference)
      } catch {
        // Keep the current selection even if saving fails.
      }
    },
  },
})
