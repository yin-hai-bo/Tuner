import assert from 'node:assert/strict'
import test from 'node:test'
import { getMessages, getPreferredLanguage } from '../miniprogram/utils/i18n.ts'

const chinese = { title: '校音器', tune: '校音', subtitle: '六弦吉他 · 标准调弦', settings: '设置', language: '语言', followSystem: '跟随系统', automatic: '自动', manual: '手动', string: '琴弦', chooseString: '（点击弦钮选择琴弦将退出自动模式）', pluckString: '请拨动一根琴弦', pluckSelectedString: '请拨动第 {number} 弦 ({note})', retryMicrophonePermission: '重试', microphonePrivacy: '声音仅用于本地实时调音，不上传、不保留录音。', microphoneRequired: '需要麦克风权限才能调音', openMicrophoneSettings: '开启麦克风权限', microphonePermissionError: '无法获取麦克风权限，请重试', debugTitle: '开发调试', debugCents: '模拟偏差（音分）', debugTone: '模拟音高', debugSilent: '无声', debugUncertain: '无法识别', debugFrequency: '输入', debugCandidate: '候选弦', pitchLow: '偏低，请缓慢拧紧', pitchHigh: '偏高，请缓慢放松', holdPitch: '请保持音高，等待稳定', unreliableInput: '请靠近手机，单独拨响一根琴弦' }
const english = { title: 'Tuner', tune: 'Tune', subtitle: '6-string guitar · Standard tuning', settings: 'Settings', language: 'Language', followSystem: 'Follow system', automatic: 'Auto', manual: 'Manual', string: 'String', chooseString: '(Selecting a string with a tuning peg exits auto mode)', pluckString: 'Pluck a single string', pluckSelectedString: 'Pluck string {number} ({note})', retryMicrophonePermission: 'Retry', microphonePrivacy: 'Audio is used locally for live tuning. No uploads or retained recordings.', microphoneRequired: 'Microphone permission is required to tune', openMicrophoneSettings: 'Enable microphone', microphonePermissionError: 'Could not access microphone permission. Try again.', debugTitle: 'Debug', debugCents: 'Simulated offset (cents)', debugTone: 'Simulate pitch', debugSilent: 'Silence', debugUncertain: 'Unreliable', debugFrequency: 'Input', debugCandidate: 'Candidate', pitchLow: 'Too low, tighten slowly', pitchHigh: 'Too high, loosen slowly', holdPitch: 'Hold the pitch steady', unreliableInput: 'Move closer and pluck a single string' }

test('a saved selection overrides the system language', () => {
  assert.equal(getPreferredLanguage('en', 'zh_CN'), 'en')
  assert.equal(getPreferredLanguage('zh-CN', 'en'), 'zh-CN')
})

for (const saved of ['system', undefined, null, '', 'fr', 'zh', 42, {}]) {
  test(`preference ${JSON.stringify(saved)} resolves using the system language`, () => {
    assert.equal(getPreferredLanguage(saved, 'zh_CN'), 'zh-CN')
    assert.equal(getPreferredLanguage(saved, 'en'), 'en')
    assert.equal(getPreferredLanguage(saved, 'ja'), 'en')
  })
}

for (const language of ['zh', 'zh_CN', 'zh-CN', 'ZH_cn']) {
  test(`${language} uses Simplified Chinese`, () => {
    assert.deepEqual(getMessages(language), chinese)
  })
}

for (const language of ['en', 'en_US', 'en-GB']) {
  test(`${language} uses English`, () => {
    assert.deepEqual(getMessages(language), english)
  })
}

for (const language of ['fr', 'ja', 'zh_TW', 'zh_HK', '']) {
  test(`${language || 'empty language'} falls back to English`, () => {
    assert.deepEqual(getMessages(language), english)
  })
}
