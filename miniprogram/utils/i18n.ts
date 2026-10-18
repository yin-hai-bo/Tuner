const messages = {
  'zh-CN': {
    title: '校音器',
    subtitle: '六弦吉他 · 标准调弦',
    settings: '设置',
    language: '语言',
    followSystem: '跟随系统',
  },
  en: {
    title: 'Tuner',
    subtitle: '6-string guitar · Standard tuning',
    settings: 'Settings',
    language: 'Language',
    followSystem: 'Follow system',
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
