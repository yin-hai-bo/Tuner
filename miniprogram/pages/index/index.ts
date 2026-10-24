import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { createAutomaticStringConfirmation } from '../../utils/automatic-string-confirmation'
import { createStableTuningConfirmation } from '../../utils/stable-tuning'
import { createSuccessConfirmation, createSuccessSound } from '../../utils/success-sound'
import { createPcmRecorder, RecordingState } from '../../utils/pcm-recorder'
import { createPcmPitchReader, PitchInputState } from '../../utils/pcm-pitch'
import { getPitchReading, getStringFrequency, selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'
let trailTimer: ReturnType<typeof setInterval> | undefined
const confirmAutomaticString = createAutomaticStringConfirmation()
const confirmStableTuning = createStableTuningConfirmation()
const confirmSuccess = createSuccessConfirmation()
let successPlaying = false
function recordingFeedback(state: RecordingState) {
  return {
    recordingState: state,
    listeningStopped: state === 'interrupted' || state === 'ended',
    recordingHintKey: state === 'interrupted' ? 'recordingInterrupted' : state === 'ended' ? 'recordingEnded' : 'microphonePrivacy',
  }
}
type RecordingPage = {
  data: { microphonePermission: string; recordingRequested: boolean }
  setData: (data: Record<string, unknown>) => void
  startRecording: () => void
  updateLiveReading: (frequency: number | null, state: PitchInputState) => void
  clearPitchReading: () => void
}
let recordingPage: RecordingPage | undefined
let pcmRecorder: ReturnType<typeof createPcmRecorder> | undefined
let recordingState: RecordingState = 'idle'
let permissionEpoch = 0
let lastLiveInputAt: number | null = null
let lastReadingAt: number | null = null
const pcmPitch = createPcmPitchReader((frequency, state) => recordingPage?.updateLiveReading(frequency, state))
const successSound = createSuccessSound(() => wx.createInnerAudioContext(), playing => {
  successPlaying = playing
  pcmPitch.reset()
  lastLiveInputAt = playing ? null : Date.now()
  if (!playing && lastReadingAt !== null) lastReadingAt = Date.now()
})

Component({
  data: {
    messages: getMessages('en'),
    pluckHint: getMessages('en').pluckString,
    microphonePermission: 'unknown' as 'unknown' | 'granted' | 'denied' | 'error',
    permissionBusy: false,
    ...recordingFeedback('idle'),
    recordingRequested: false,
    pcmBytes: 0,
    liveFrequency: '',
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
    pitchStable: false,
    animateSuccess: false,
    debugMarkerColor: '#f2f5f3',
    debugAutoTarget: 0,
    debugHintKey: 'pluckString',
    pitchTrail: [] as { id: number; offset: number; color: string }[],
  },
  lifetimes: {
    detached() {
      this.leaveMicrophone()
      this.stopPitchTrail()
    },
  },
  pageLifetimes: {
    hide() {
      this.leaveMicrophone()
      this.stopPitchTrail()
      this.updateDebugReading('silent')
    },
    show() {
      permissionEpoch++
      recordingPage = this
      this.setData({ permissionBusy: false, ...recordingFeedback(recordingState) })
      let savedLanguage: unknown
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      const { language } = wx.getAppBaseInfo()
      const { platform } = wx.getDeviceInfo()
      const messages = getMessages(getPreferredLanguage(savedLanguage, language))
      this.setData({ messages, debugEnabled: platform === 'devtools', microphonePermission: 'unknown' })
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
    startRecording() {
      if (recordingPage !== this || this.data.microphonePermission !== 'granted') return
      if (!pcmRecorder) {
        const isDevtools = this.data.debugEnabled
        pcmRecorder = createPcmRecorder(wx.getRecorderManager(),
          frame => {
            recordingPage?.setData({ pcmBytes: frame.byteLength })
            if (!successPlaying) pcmPitch.push(frame)
          },
          state => {
            recordingState = state
            if (state !== 'recording') {
              this.resetSuccessFeedback()
              pcmPitch.reset()
              recordingPage?.setData({ liveFrequency: '' })
              recordingPage?.clearPitchReading()
            }
            recordingPage?.setData(recordingFeedback(state))
            if (['interrupted', 'ended', 'error'].includes(state)) recordingPage?.setData({ recordingRequested: false })
            if (state === 'idle' && recordingPage?.data.recordingRequested) recordingPage.startRecording()
          },
          filePath => new Promise<void>((resolve, reject) => {
            // Devtools returns virtual HTTP files that its filesystem cannot unlink.
            if (isDevtools && filePath.startsWith('http://tmp/')) {
              resolve()
              return
            }
            wx.getFileSystemManager().unlink({ filePath, success: () => resolve(), fail: reject })
          }))
      }
      this.setData({ recordingRequested: true })
      pcmRecorder.start()
    },
    leaveMicrophone() {
      if (recordingPage !== this) return
      this.resetSuccessFeedback()
      permissionEpoch++
      recordingPage = undefined
      pcmPitch.reset()
      this.clearPitchReading()
      this.setData({ permissionBusy: false, recordingRequested: false, pcmBytes: 0, liveFrequency: '' })
      pcmRecorder?.stop()
    },
    setMicrophonePermission(microphonePermission: 'granted' | 'denied' | 'error') {
      this.setData({ microphonePermission, permissionBusy: false })
      if (microphonePermission === 'granted') this.startRecording()
    },
    requestMicrophonePermission() {
      if (this.data.permissionBusy || this.data.microphonePermission === 'granted') return
      this.setData({ permissionBusy: true })
      const epoch = permissionEpoch
      const finish = (status: 'granted' | 'denied' | 'error') => {
        if (epoch === permissionEpoch && recordingPage === this) this.setMicrophonePermission(status)
      }
      wx.getSetting({
        success: result => {
          if (epoch !== permissionEpoch || recordingPage !== this) return
          const allowed = result.authSetting['scope.record']
          if (allowed !== undefined) {
            finish(allowed ? 'granted' : 'denied')
            return
          }
          wx.authorize({
            scope: 'scope.record',
            success: () => finish('granted'),
            fail: () => wx.getSetting({
              success: result => finish(
                result.authSetting['scope.record'] === false ? 'denied' : 'error'),
              fail: () => finish('error'),
            }),
          })
        },
        fail: () => finish('error'),
      })
    },
    openMicrophoneSettings() {
      if (this.data.permissionBusy) return
      this.setData({ permissionBusy: true })
      const epoch = permissionEpoch
      wx.openSetting({
        success: result => {
          if (epoch === permissionEpoch && recordingPage === this) {
            this.setMicrophonePermission(result.authSetting['scope.record'] ? 'granted' : 'denied')
          }
        },
        fail: () => {
          if (epoch === permissionEpoch && recordingPage === this) this.setMicrophonePermission('error')
        },
      })
    },
    stopPitchTrail() {
      this.resetSuccessFeedback()
      lastReadingAt = null
      confirmAutomaticString(null, Date.now())
      confirmStableTuning(null, 0, Date.now())
      if (trailTimer !== undefined) clearInterval(trailTimer)
      trailTimer = undefined
      this.setData({ pitchTrail: [], pitchStable: false, animateSuccess: false })
    },
    samplePitchTrail() {
      if (successPlaying) return
      if (this.data.debugOpen) this.updateDebugReading(this.data.debugState)
      const now = Date.now()
      if (!this.data.debugOpen && lastLiveInputAt !== null && now - lastLiveInputAt >= 1000) {
        this.applyPitchReading(null, 'silent')
        lastLiveInputAt = null
      }
      if (this.data.debugState === 'silent' && lastReadingAt !== null && now - lastReadingAt >= 1000) this.clearPitchReading()
      const { pitchTrail, debugReading, debugState, debugOffset, debugMarkerColor } = this.data
      const points = pitchTrail.filter(point => point.id > now - 20000)
      if (debugReading && debugState !== 'silent') {
        points.push({ id: now, offset: debugOffset,
          color: this.data.debugInTune ? '#16834b' : debugMarkerColor })
      }
      if (points.length !== pitchTrail.length || points[points.length - 1] !== pitchTrail[pitchTrail.length - 1]) {
        this.setData({ pitchTrail: points })
      }
    },
    toggleDebugPanel() {
      if (!this.data.debugEnabled) return
      this.resetSuccessFeedback()
      this.setData({ debugOpen: !this.data.debugOpen })
      this.clearPitchReading()
    },
    clearPitchReading() {
      lastReadingAt = null
      this.applyPitchReading(null, 'silent')
    },
    updateLiveReading(frequency: number | null, state: PitchInputState) {
      if (successPlaying) return
      lastLiveInputAt = Date.now()
      this.setData({ liveFrequency: frequency === null ? '' : frequency.toFixed(2) })
      if (!this.data.debugOpen) this.applyPitchReading(frequency, state)
    },
    updateDebugReading(state: 'tone' | 'silent' | 'uncertain') {
      if (!this.data.debugEnabled) return
      const { debugIndex, debugCents } = this.data
      const base = getStringFrequency(standardTuning[debugIndex].number)!
      const frequency = base * 2 ** (debugCents / 1200)
      this.applyPitchReading(state === 'tone' ? frequency : null, state)
    },
    applyPitchReading(frequency: number | null, state: PitchInputState) {
      if (successPlaying) return
      const now = Date.now()
      const holding = lastReadingAt !== null && now - lastReadingAt < 1000 && now >= lastReadingAt
      if (state === 'silent' && holding && this.data.debugReading) {
        confirmStableTuning(null, 0, now)
        this.setData({ debugState: state, debugFrequency: '' })
        return
      }
      const { selection } = this.data
      const candidate = state === 'tone' && frequency !== null
        ? getPitchReading(frequency, selection.mode === 'manual' ? selection.target.number : undefined)
        : null
      const confirmed = confirmAutomaticString(
        selection.mode === 'auto' && candidate ? candidate.target.number : null, Date.now())
      const reading = selection.mode === 'manual' || confirmed === candidate?.target.number ? candidate : null
      const cents = reading ? Math.round(reading.cents) : 0
      const distance = reading ? Math.abs(reading.cents) : 0
      // Allow only negligible floating-point error at the exact 2-cent boundary.
      const debugInTune = reading !== null && distance <= 2 + 1e-7
      const stable = confirmStableTuning(reading ? reading.target.number : null, reading ? reading.cents : 0, now)
      const pitchStable = stable || (holding && this.data.pitchStable && debugInTune &&
        this.data.debugReading?.target.number === reading?.target.number)
      const success = confirmSuccess.update(reading?.target.number ?? null, reading?.cents ?? 0, stable)
      lastReadingAt = reading ? now : null
      const redness = Math.max(0, Math.min(1, (distance - 2) / 98))
      const debugMarkerColor = !reading && state === 'uncertain' ? '#7b8580' : !reading || debugInTune ? '#f2f5f3'
        : `rgb(244, ${Math.round(200 - 130 * redness)}, ${Math.round(78 - 8 * redness)})`
      const debugHintKey = !reading ? (state === 'uncertain' ? 'unreliableInput' : 'pluckString')
        : pitchStable ? 'inTune' : debugInTune ? 'holdPitch' : reading.cents < 0 ? 'pitchLow' : 'pitchHigh'
      this.setData({ debugState: state, debugFrequency: frequency !== null ? frequency.toFixed(3) : '',
        debugReading: reading, debugDeviation: cents,
        debugOffset: reading ? Math.max(-40, Math.min(40, reading.cents * .4)) : 0,
        debugAutoTarget: reading && selection.mode === 'auto' ? reading.target.number : 0,
        debugHintKey, debugInTune, debugMarkerColor, pitchStable,
        animateSuccess: pitchStable && (success || this.data.animateSuccess) })
      if (success) successSound.play()
    },
    resetSuccessFeedback() {
      successSound.stop()
      confirmSuccess.reset()
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
      this.resetSuccessFeedback()
      this.setData({ selection })
      lastReadingAt = null
      confirmStableTuning(null, 0, Date.now())
      this.updatePluckHint()
      if (this.data.debugOpen) this.updateDebugReading(this.data.debugState)
      else this.clearPitchReading()
    },
    toggleAutomatic(event: WechatMiniprogram.SwitchChange) {
      this.resetSuccessFeedback()
      const selection = event.detail.value
        ? useAutomaticSelection()
        : selectString(this.data.selection, 6)
      this.setData({ selection })
      lastReadingAt = null
      confirmStableTuning(null, 0, Date.now())
      this.updatePluckHint()
      if (this.data.debugOpen) this.updateDebugReading(this.data.debugState)
      else this.clearPitchReading()
    },
  },
})
