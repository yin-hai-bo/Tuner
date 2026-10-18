const messages = {
  'zh-CN': {
    title: '校音器',
    tune: '校音',
    subtitle: '六弦吉他 · 标准调弦',
    settings: '设置',
    language: '语言',
    followSystem: '跟随系统',
    automatic: '自动',
    manual: '手动',
    string: '琴弦',
    chooseString: '点击弦钮选择琴弦',
  },
  en: {
    title: 'Tuner',
    tune: 'Tune',
    subtitle: '6-string guitar · Standard tuning',
    settings: 'Settings',
    language: 'Language',
    followSystem: 'Follow system',
    automatic: 'Auto',
    manual: 'Manual',
    string: 'String',
    chooseString: 'Tap a tuning peg to select a string',
  },
}

export function getMessages(language: string) {
  const normalized = language.toLowerCase().replace('_', '-')
  const locale = normalized === 'zh' || normalized === 'zh-cn' ? 'zh-CN' : 'en'
  return messages[locale]
}

export function getPreferredLanguage(savedLanguage: unknown, systemLanguage: string) {
  if (savedLanguage === 'zh-CN' || savedLanguage === 'en') return savedLanguage
  return getMessages(systemLanguage) === messages['zh-CN'] ? 'zh-CN' : 'en'
}
