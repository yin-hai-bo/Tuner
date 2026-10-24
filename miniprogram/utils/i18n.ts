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
    chooseString: '（点击弦钮选择琴弦将退出自动模式）',
    pluckString: '请拨动一根琴弦',
    pluckSelectedString: '请拨动第 {number} 弦 ({note})',
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
    chooseString: '(Selecting a string with a tuning peg exits auto mode)',
    pluckString: 'Pluck a single string',
    pluckSelectedString: 'Pluck string {number} ({note})',
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
