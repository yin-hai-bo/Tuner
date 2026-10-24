import { writeFileSync } from 'node:fs'

// A soft doorbell-style ding-dong, with a lower second note and fading bell partials.
const rate = 16000, duration = .5, count = Math.round(rate * duration)
const notes = [{ start: 0, frequency: 880, length: .2 }, { start: .16, frequency: 698.456, length: .34 }]
const wav = Buffer.alloc(44 + count * 2)
wav.write('RIFF', 0)
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(rate, 24)
wav.writeUInt32LE(rate * 2, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(count * 2, 40)
for (let i = 0; i < count; i++) {
  const time = i / rate
  let sound = 0
  for (const note of notes) {
    const elapsed = time - note.start
    if (elapsed < 0 || elapsed >= note.length) continue
    const phase = 2 * Math.PI * note.frequency * elapsed
    const envelope = Math.min(1, elapsed / .005, (note.length - elapsed) / .08) * Math.exp(-elapsed * 8)
    const bell = Math.sin(phase) + .22 * Math.exp(-elapsed * 10) * Math.sin(phase * 2.76)
      + .08 * Math.exp(-elapsed * 18) * Math.sin(phase * 4.07)
    sound += bell * envelope
  }
  wav.writeInt16LE(Math.round(sound * 11000), 44 + i * 2)
}
writeFileSync(new URL('../miniprogram/assets/tuning-success.wav', import.meta.url), wav)
