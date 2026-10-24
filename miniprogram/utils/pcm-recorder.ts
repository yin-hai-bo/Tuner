export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping' | 'ended' | 'interrupted' | 'error'

// Construct once for wx's global RecorderManager. The caller checks permission
// before start(), and calls stop() when leaving the page. PCM stays in memory.
export function createPcmRecorder(
  recorder: WechatMiniprogram.RecorderManager,
  onFrame: (frame: ArrayBuffer) => void,
  onState: (state: RecordingState) => void,
  removeFile: (path: string) => Promise<void>,
) {
  let state: RecordingState = 'idle'
  let interrupted = false
  let pendingStop = false
  function update(next: RecordingState) {
    state = next
    onState(next)
  }
  recorder.onStart(() => {
    if (state === 'starting') update('recording')
    else if (state !== 'recording') recorder.stop()
  })
  recorder.onFrameRecorded(({ frameBuffer }) => {
    if (state === 'recording' && frameBuffer.byteLength > 0) onFrame(frameBuffer)
  })
  recorder.onStop(async ({ tempFilePath }) => {
    const next = state === 'interrupted' || state === 'error' ? state : state === 'stopping' ? 'idle' : 'ended'
    update('stopping')
    pendingStop = true
    try {
      if (tempFilePath) await removeFile(tempFilePath)
      update(next)
    } catch {
      update('error')
    } finally {
      pendingStop = false
    }
  })
  recorder.onError(() => update('error'))
  recorder.onInterruptionBegin(() => {
    interrupted = true
    if (state !== 'starting' && state !== 'recording') return
    pendingStop = true
    update('interrupted')
    recorder.stop()
  })
  recorder.onInterruptionEnd(() => { interrupted = false })
  return {
    start() {
      if (interrupted || pendingStop || !['idle', 'ended', 'interrupted'].includes(state)) return false
      update('starting')
      try {
        recorder.start({ duration: 600000, sampleRate: 16000, numberOfChannels: 1, format: 'PCM', frameSize: 4 })
      } catch {
        update('error')
        return false
      }
      return true
    },
    stop() {
      if (state !== 'starting' && state !== 'recording') return
      update('stopping')
      recorder.stop()
    },
  }
}
