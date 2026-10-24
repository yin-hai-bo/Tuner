import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { createAutomaticStringConfirmation } from '../../utils/automatic-string-confirmation'
import { getPitchReading, getStringFrequency, selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'
let trailTimer: ReturnType<typeof setInterval> | undefined
const confirmAutomaticString = createAutomaticStringConfirmation()

Component({
  data: {
    messages: getMessages('en'),
    pluckHint: getMessages('en').pluckString,
    microphonePermission: 'unknown' as 'unknown' | 'granted' | 'denied' | 'error',
    permissionBusy: false,
    selection: useAutomaticSelection(),
    leftTuners: standardTuning.slice(0, 3).reverse(),
    rightTuners: standardTuning.slice(3),
    debugEnabled: false,
    debugOpen: false,
    debugStrings: standardTuning.map(string => `${string.number} · ${string.note}`),
    debugIndex: 0,
    debugCents: 0,
    debugState: 'silent' as 'tone' | 'silent' | 'uncertain',
    debugFrequency: '',
    debugReading: null as ReturnType<typeof getPitchReading>,
    debugDeviation: 0,
    debugOffset: 0,
    debugInTune: false,
    debugMarkerColor: '#f2f5f3',
    debugAutoTarget: 0,
    debugHintKey: 'pluckString',
    pitchTrail: [] as { id: number; offset: number; color: string }[],
  },
  lifetimes: {
    detached() {
      this.stopPitchTrail()
    },
  },
  pageLifetimes: {
    hide() {
      this.stopPitchTrail()
      this.updateDebugReading('silent')
    },
    show() {
      let savedLanguage: unknown
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      const system = wx.getSystemInfoSync()
      const messages = getMessages(getPreferredLanguage(savedLanguage, system.language))
      this.setData({ messages, debugEnabled: system.platform === 'devtools', microphonePermission: 'unknown' })
      this.stopPitchTrail()
      trailTimer = setInterval(() => this.samplePitchTrail(), 100)
      this.updatePluckHint()
      wx.setNavigationBarTitle({ title: messages.title })
      wx.setTabBarItem({ index: 0, text: messages.tune })
      wx.setTabBarItem({ index: 1, text: messages.settings })
      this.requestMicrophonePermission()
    },
  },
  methods: {
    setMicrophonePermission(microphonePermission: 'granted' | 'denied' | 'error') {
      this.setData({ microphonePermission, permissionBusy: false })
    },
    requestMicrophonePermission() {
      if (this.data.permissionBusy || this.data.microphonePermission === 'granted') return
      this.setData({ permissionBusy: true })
      wx.getSetting({
        success: result => {
          const allowed = result.authSetting['scope.record']
          if (allowed !== undefined) {
            this.setMicrophonePermission(allowed ? 'granted' : 'denied')
            return
          }
          wx.authorize({
            scope: 'scope.record',
            success: () => this.setMicrophonePermission('granted'),
            fail: () => wx.getSetting({
              success: result => this.setMicrophonePermission(
                result.authSetting['scope.record'] === false ? 'denied' : 'error'),
              fail: () => this.setMicrophonePermission('error'),
            }),
          })
        },
        fail: () => this.setMicrophonePermission('error'),
      })
    },
    openMicrophoneSettings() {
      if (this.data.permissionBusy) return
      this.setData({ permissionBusy: true })
      wx.openSetting({
        success: result => this.setMicrophonePermission(result.authSetting['scope.record'] ? 'granted' : 'denied'),
        fail: () => this.setMicrophonePermission('error'),
      })
    },
    stopPitchTrail() {
      confirmAutomaticString(null, Date.now())
      if (trailTimer !== undefined) clearInterval(trailTimer)
      trailTimer = undefined
      this.setData({ pitchTrail: [] })
    },
    samplePitchTrail() {
      if (this.data.debugOpen) this.updateDebugReading(this.data.debugState)
      const now = Date.now()
      const { pitchTrail, debugOpen, debugReading, debugOffset, debugMarkerColor } = this.data
      const points = pitchTrail.filter(point => point.id > now - 20000)
      if (debugOpen && debugReading) {
        points.push({ id: now, offset: debugOffset,
          color: this.data.debugInTune ? '#16834b' : debugMarkerColor })
      }
      if (points.length !== pitchTrail.length || points[points.length - 1] !== pitchTrail[pitchTrail.length - 1]) {
        this.setData({ pitchTrail: points })
      }
    },
    toggleDebugPanel() {
      if (!this.data.debugEnabled) return
      this.setData({ debugOpen: !this.data.debugOpen })
      if (!this.data.debugOpen) this.updateDebugReading('silent')
    },
    updateDebugReading(state: 'tone' | 'silent' | 'uncertain') {
      if (!this.data.debugEnabled) return
      const { debugIndex, debugCents, selection } = this.data
      const base = getStringFrequency(standardTuning[debugIndex].number)!
      const frequency = base * 2 ** (debugCents / 1200)
      const candidate = state === 'tone'
        ? getPitchReading(frequency, selection.mode === 'manual' ? selection.target.number : undefined)
        : null
      const confirmed = confirmAutomaticString(
        selection.mode === 'auto' && candidate ? candidate.target.number : null, Date.now())
      const reading = selection.mode === 'manual' || confirmed === candidate?.target.number ? candidate : null
      const cents = reading ? Math.round(reading.cents) : 0
      const distance = reading ? Math.abs(reading.cents) : 0
      // Allow only negligible floating-point error at the exact 2-cent boundary.
      const debugInTune = reading !== null && distance <= 2 + 1e-7
      const redness = Math.max(0, Math.min(1, (distance - 2) / 98))
      const debugMarkerColor = !reading || debugInTune ? '#f2f5f3'
        : `rgb(244, ${Math.round(200 - 130 * redness)}, ${Math.round(78 - 8 * redness)})`
      const debugHintKey = !reading ? (state === 'uncertain' ? 'unreliableInput' : 'pluckString')
        : debugInTune ? 'holdPitch' : reading.cents < 0 ? 'pitchLow' : 'pitchHigh'
      this.setData({ debugState: state, debugFrequency: state === 'tone' ? frequency.toFixed(3) : '',
        debugReading: reading, debugDeviation: cents,
        debugOffset: reading ? Math.max(-40, Math.min(40, reading.cents * .4)) : 0,
        debugAutoTarget: reading && selection.mode === 'auto' ? reading.target.number : 0,
        debugHintKey, debugInTune, debugMarkerColor })
    },
    debugSelectString(event: WechatMiniprogram.PickerChange) {
      const index = Number(event.detail.value)
      if (!this.data.debugEnabled || !Number.isInteger(index) || index < 0 || index >= standardTuning.length) return
      this.setData({ debugIndex: index })
      this.updateDebugReading('tone')
    },
    debugChangeCents(event: WechatMiniprogram.SliderChange) {
      const cents = event.detail.value
      if (!this.data.debugEnabled || !Number.isFinite(cents) || cents < -100 || cents > 100) return
      this.setData({ debugCents: cents })
      this.updateDebugReading('tone')
    },
    debugSetState(event: WechatMiniprogram.TouchEvent) {
      const state = event.currentTarget.dataset.state
      if (state === 'tone' || state === 'silent' || state === 'uncertain') this.updateDebugReading(state)
    },
    updatePluckHint() {
      const { selection, messages } = this.data
      const pluckHint = selection.mode === 'manual'
        ? messages.pluckSelectedString
          .replace('{number}', String(selection.target.number))
          .replace('{note}', selection.target.note)
        : messages.pluckString
      this.setData({ pluckHint })
    },
    selectTuner(event: WechatMiniprogram.TouchEvent) {
      const number = event.currentTarget.dataset.number
      if (typeof number !== 'number') return
      const selection = selectString(this.data.selection, number)
      if (selection === this.data.selection) return
      this.setData({ selection })
      this.updatePluckHint()
      this.updateDebugReading(this.data.debugState)
    },
    toggleAutomatic(event: WechatMiniprogram.SwitchChange) {
      const selection = event.detail.value
        ? useAutomaticSelection()
        : selectString(this.data.selection, 6)
      this.setData({ selection })
      this.updatePluckHint()
      this.updateDebugReading(this.data.debugState)
    },
  },
})
