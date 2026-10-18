const messages = {
  'zh-CN': {
    title: '校音器',
    subtitle: '六弦吉他 · 标准调弦',
  },
  en: {
    title: 'Tuner',
    subtitle: '6-string guitar · Standard tuning',
  },
}

export function getMessages(language: string) {
  const normalized = language.toLowerCase().replace('_', '-')
  const locale = normalized === 'zh' || normalized === 'zh-cn' ? 'zh-CN' : 'en'
  return messages[locale]
}
