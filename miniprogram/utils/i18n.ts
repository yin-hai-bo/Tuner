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
    debugTitle: '开发调试',
    debugCents: '模拟偏差（音分）',
    debugTone: '模拟音高',
    debugSilent: '无声',
    debugUncertain: '无法识别',
    debugFrequency: '输入',
    debugCandidate: '候选弦',
    pitchLow: '偏低，请缓慢拧紧',
    pitchHigh: '偏高，请缓慢放松',
    holdPitch: '请保持音高，等待稳定',
    unreliableInput: '请靠近手机，单独拨响一根琴弦',
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
    debugTitle: 'Debug',
    debugCents: 'Simulated offset (cents)',
    debugTone: 'Simulate pitch',
    debugSilent: 'Silence',
    debugUncertain: 'Unreliable',
    debugFrequency: 'Input',
    debugCandidate: 'Candidate',
    pitchLow: 'Too low, tighten slowly',
    pitchHigh: 'Too high, loosen slowly',
    holdPitch: 'Hold the pitch steady',
    unreliableInput: 'Move closer and pluck a single string',
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
