export function createSuccessConfirmation() {
  let target: number | null = null
  let notified = false
  return {
    reset() { target = null; notified = false },
    update(number: number | null, cents: number, stable: boolean) {
      if (number === null) return false
      if (target !== number) { target = number; notified = false }
      if (Math.abs(cents) >= 5 - 1e-7) notified = false
      if (!stable || notified) return false
      notified = true
      return true
    },
  }
}

// Each playback owns its audio context so late callbacks cannot stop a newer sound.
export function createSuccessSound(
  createAudio: () => WechatMiniprogram.InnerAudioContext,
  onPlaying: (playing: boolean) => void,
) {
  let current: WechatMiniprogram.InnerAudioContext | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  function finish(audio: WechatMiniprogram.InnerAudioContext) {
    if (current !== audio) return
    current = undefined
    if (timeout !== undefined) clearTimeout(timeout)
    timeout = undefined
    try { audio.stop() } catch { /* Still release the audio context. */ }
    try { audio.destroy() } catch { /* Always release the playing state. */ }
    onPlaying(false)
  }
  return {
    play() {
      if (current) return false
      let audio: WechatMiniprogram.InnerAudioContext
      try { audio = createAudio() } catch { return false }
      current = audio
      onPlaying(true)
      try {
        audio.onEnded(() => finish(audio))
        audio.onError(() => finish(audio))
        audio.src = '/assets/tuning-success.wav'
        timeout = setTimeout(() => finish(audio), 1000)
        audio.play()
      } catch {
        finish(audio)
        return false
      }
      return true
    },
    stop() { if (current) finish(current) },
  }
}
