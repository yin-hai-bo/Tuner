import { detectPitch } from './pitch-detection'

// Input contract: signed 16-bit little-endian mono PCM, 16 kHz.
// Retain only one 256ms window; reset between recording sessions.
export function createPcmPitchReader(onPitch: (frequency: number | null) => void) {
  const samples = new Float32Array(4096)
  let length = 0
  let lowByte: number | null = null
  return {
    push(frame: ArrayBuffer) {
      for (const byte of new Uint8Array(frame)) {
        if (lowByte === null) {
          lowByte = byte
          continue
        }
        const value = lowByte | (byte << 8)
        samples[length++] = (value >= 32768 ? value - 65536 : value) / 32768
        lowByte = null
        if (length === samples.length) {
          length = 0
          onPitch(detectPitch(samples, 16000))
        }
      }
    },
    reset() {
      length = 0
      lowByte = null
      samples.fill(0)
    },
  }
}
