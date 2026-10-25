import { getMessages, getPreferredLanguage } from '../../utils/i18n'
import { createStableTuningConfirmation } from '../../utils/stable-tuning'
import { createSuccessConfirmation, createSuccessSound } from '../../utils/success-sound'
import { createPcmRecorder, RecordingState } from '../../utils/pcm-recorder'
import { createPcmPitchReader, PitchInputState } from '../../utils/pcm-pitch'
import { getPitchReading, selectString, standardTuning, useAutomaticSelection } from '../../utils/tuning-selection'

const languageStorageKey = 'preferredLanguage'
const licenseStorageKey = 'usageNoticeAccepted'
let trailTimer: ReturnType<typeof setInterval> | undefined
const confirmStableTuning = createStableTuningConfirmation()
const confirmSuccess = createSuccessConfirmation()
let successPlaying = false
function recordingFeedback(state: RecordingState) {
  return {
    recordingState: state,
    listeningStopped: ['interrupted', 'ended', 'error', 'cleanup-error'].includes(state),
    recordingHintKey: state === 'error' ? 'recordingError' : state === 'cleanup-error' ? 'recordingCleanupError' :
      state === 'interrupted' ? 'recordingInterrupted' : state === 'ended' ? 'recordingEnded' : 'microphonePrivacy',
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
let pendingAutoString: number | null = null
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
    licenseAccepted: false,
    licenseOpen: false,
    licenseChecked: false,
    licenseSaveFailed: false,
    ...recordingFeedback('idle'),
    recordingRequested: false,
    selection: useAutomaticSelection(),
    leftTuners: standardTuning.slice(0, 3).reverse(),
    rightTuners: standardTuning.slice(3),
    pitchInputState: 'silent' as 'tone' | 'silent' | 'uncertain',
    pitchReading: null as ReturnType<typeof getPitchReading>,
    pitchDeviation: 0,
    pitchOffset: 0,
    pitchInTune: false,
    pitchStable: false,
    animateSuccess: false,
    pitchMarkerColor: '#f2f5f3',
    automaticTarget: 0,
    pitchHintKey: 'pluckString',
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
    },
    show() {
      permissionEpoch++
      recordingPage = this
      this.setData({ permissionBusy: false, ...recordingFeedback(recordingState) })
      let savedLanguage: unknown
      let licenseAccepted = false
      try {
        savedLanguage = wx.getStorageSync(languageStorageKey)
        licenseAccepted = wx.getStorageSync(licenseStorageKey) === true
      } catch {
        // Storage may be unavailable; continue with the system language.
      }
      const { language } = wx.getAppBaseInfo()
      const messages = getMessages(getPreferredLanguage(savedLanguage, language))
      this.setData({ messages, licenseAccepted, microphonePermission: 'unknown' })
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
      if (recordingPage !== this || this.data.microphonePermission !== 'granted' || !this.data.licenseAccepted) return
      if (!pcmRecorder) {
        const isDevtools = wx.getDeviceInfo().platform === 'devtools'
        pcmRecorder = createPcmRecorder(wx.getRecorderManager(),
          frame => {
            if (!successPlaying) pcmPitch.push(frame)
          },
          state => {
            recordingState = state
            if (state !== 'recording') {
              this.resetSuccessFeedback()
              pcmPitch.reset()
              recordingPage?.clearPitchReading()
            }
            recordingPage?.setData(recordingFeedback(state))
            if (['interrupted', 'ended', 'error', 'cleanup-error'].includes(state)) recordingPage?.setData({ recordingRequested: false })
            if (state === 'idle' && recordingPage?.data.recordingRequested) recordingPage.startRecording()
          },
          filePath => new Promise<void>((resolve, reject) => {
            // Recorder-owned temporary files are managed by WeChat, not writable
            // user files. Do not persist them just to gain deletion permission.
            if (/^wxfile:\/\/tmp_[0-9a-f]+\.pcm$/i.test(filePath)) {
              resolve()
              return
            }
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
      this.setData({ permissionBusy: false, recordingRequested: false })
      pcmRecorder?.stop()
    },
    setMicrophonePermission(microphonePermission: 'granted' | 'denied' | 'error') {
      this.setData({ microphonePermission, permissionBusy: false })
      if (microphonePermission !== 'granted') return
      if (this.data.licenseAccepted) this.startRecording()
      else {
        this.setData({ licenseOpen: true, licenseChecked: false, licenseSaveFailed: false })
        wx.hideTabBar({})
      }
    },
    changeLicenseAgreement(event: WechatMiniprogram.CheckboxGroupChange) {
      this.setData({ licenseChecked: event.detail.value.includes('agree'), licenseSaveFailed: false })
    },
    acceptLicense() {
      if (recordingPage !== this || !this.data.licenseOpen || !this.data.licenseChecked) return
      try { wx.setStorageSync(licenseStorageKey, true) } catch {
        this.setData({ licenseSaveFailed: true })
        return
      }
      this.setData({ licenseAccepted: true, licenseOpen: false })
      wx.showTabBar({})
      this.startRecording()
    },
    ignoreLicenseTouch() {},
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
      pendingAutoString = null
      lastReadingAt = null
      confirmStableTuning(null, 0, Date.now())
      if (trailTimer !== undefined) clearInterval(trailTimer)
      trailTimer = undefined
      this.setData({ pitchTrail: [], pitchStable: false, animateSuccess: false })
    },
    samplePitchTrail() {
      if (this.data.licenseOpen || successPlaying) return
      const now = Date.now()
      if (lastLiveInputAt !== null && now - lastLiveInputAt >= 1000) {
        this.applyPitchReading(null, 'silent')
        lastLiveInputAt = null
      }
      if (this.data.pitchInputState === 'silent' && lastReadingAt !== null && now - lastReadingAt >= 1000) this.clearPitchReading()
      if (pendingAutoString !== null) return
      const { pitchTrail, pitchReading, pitchInputState, pitchOffset, pitchMarkerColor } = this.data
      const points = pitchTrail.filter(point => point.id > now - 20000)
      if (pitchReading && pitchInputState !== 'silent') {
        points.push({ id: now, offset: pitchOffset,
          color: this.data.pitchInTune ? '#16834b' : pitchMarkerColor })
      }
      if (points.length !== pitchTrail.length || points[points.length - 1] !== pitchTrail[pitchTrail.length - 1]) {
        this.setData({ pitchTrail: points })
      }
    },
    clearPitchReading() {
      lastReadingAt = null
      this.applyPitchReading(null, 'silent')
    },
    updateLiveReading(frequency: number | null, state: PitchInputState) {
      if (successPlaying) return
      lastLiveInputAt = Date.now()
      this.applyPitchReading(frequency, state)
    },
    applyPitchReading(frequency: number | null, state: PitchInputState) {
      if (successPlaying) return
      const now = Date.now()
      if (state !== 'tone') pendingAutoString = null
      const holding = lastReadingAt !== null && now - lastReadingAt < 1000 && now >= lastReadingAt
      if (state === 'silent' && holding && this.data.pitchReading) {
        confirmStableTuning(null, 0, now)
        this.setData({ pitchInputState: state })
        return
      }
      const { selection } = this.data
      const reading = state === 'tone' && frequency !== null
        ? getPitchReading(frequency, selection.mode === 'manual' ? selection.target.number : undefined)
        : null
      const previous = this.data.pitchReading?.target.number
      const target = reading?.target.number ?? null
      const switchingString = selection.mode === 'auto' && holding &&
        previous !== undefined && target !== null && previous !== target
      if (switchingString && pendingAutoString !== target) {
        pendingAutoString = target
        confirmStableTuning(null, 0, now)
        this.setData({ pitchInputState: 'tone' })
        return
      }
      pendingAutoString = null
      const cents = reading ? Math.round(reading.cents) : 0
      const distance = reading ? Math.abs(reading.cents) : 0
      // Allow only negligible floating-point error at the exact 2-cent boundary.
      const pitchInTune = reading !== null && distance <= 2 + 1e-7
      const stable = confirmStableTuning(reading ? reading.target.number : null, reading ? reading.cents : 0, now)
      const pitchStable = stable || (holding && this.data.pitchStable && pitchInTune &&
        this.data.pitchReading?.target.number === reading?.target.number)
      const success = confirmSuccess.update(reading?.target.number ?? null, reading?.cents ?? 0, stable)
      lastReadingAt = reading ? now : null
      const redness = Math.max(0, Math.min(1, (distance - 2) / 98))
      const pitchMarkerColor = !reading && state === 'uncertain' ? '#7b8580' : !reading || pitchInTune ? '#f2f5f3'
        : `rgb(244, ${Math.round(200 - 130 * redness)}, ${Math.round(78 - 8 * redness)})`
      const pitchHintKey = !reading ? (state === 'uncertain' ? 'unreliableInput' : 'pluckString')
        : pitchStable ? 'inTune' : pitchInTune ? 'holdPitch' : reading.cents < 0 ? 'pitchLow' : 'pitchHigh'
      this.setData({ pitchInputState: state,
        pitchReading: reading, pitchDeviation: cents,
        pitchOffset: reading ? Math.max(-40, Math.min(40, reading.cents * .4)) : 0,
        automaticTarget: reading && selection.mode === 'auto' ? reading.target.number : 0,
        pitchHintKey, pitchInTune, pitchMarkerColor, pitchStable,
        animateSuccess: pitchStable && (success || this.data.animateSuccess) })
      if (success) successSound.play()
    },
    resetSuccessFeedback() {
      successSound.stop()
      confirmSuccess.reset()
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
      this.clearPitchReading()
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
      this.clearPitchReading()
    },
  },
})
