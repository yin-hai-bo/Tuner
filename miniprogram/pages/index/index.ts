import { getMessages } from '../../utils/i18n'

Component({
  data: {
    messages: getMessages('en'),
  },
  lifetimes: {
    attached() {
      const messages = getMessages(wx.getSystemInfoSync().language)
      this.setData({ messages })
      wx.setNavigationBarTitle({ title: messages.title })
    },
  },
})
