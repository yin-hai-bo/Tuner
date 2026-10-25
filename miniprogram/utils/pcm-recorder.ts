export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping' | 'ended' | 'interrupted' | 'error' | 'cleanup-error'

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
  let cleaning = false
  let cleanupPath = ''
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
  async function cleanup(tempFilePath: string, next: RecordingState) {
    pendingStop = true
    cleaning = true
    cleanupPath = tempFilePath
    update('stopping')
    try {
      if (tempFilePath) await removeFile(tempFilePath)
      cleanupPath = ''
    } catch {
      next = 'cleanup-error'
    }
    cleaning = false
    pendingStop = false
    update(next === 'cleanup-error' ? next : state === 'error' ? 'error' : next)
  }
  recorder.onStop(({ tempFilePath }) => {
    const next = state === 'interrupted' || state === 'error' ? state : state === 'stopping' ? 'idle' : 'ended'
    return cleanup(tempFilePath, next)
  })
  recorder.onError(() => {
    if (!cleaning) pendingStop = false
    update('error')
  })
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
      if (interrupted || pendingStop) return false
      if (cleanupPath) {
        void cleanup(cleanupPath, 'idle')
        return true
      }
      if (!['idle', 'ended', 'interrupted', 'error'].includes(state)) return false
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
