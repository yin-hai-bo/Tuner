import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createSuccessConfirmation, createSuccessSound } from '../miniprogram/utils/success-sound.ts'

test('success re-arms only at five cents, a new target or an explicit reset', () => {
  const confirmation = createSuccessConfirmation()
  assert.equal(confirmation.update(6, 0, false), false)
  assert.equal(confirmation.update(6, 0, true), true)
  for (const cents of [0, 2, -2, 4.99, -4.99]) {
    confirmation.update(6, cents, false)
    confirmation.update(null, 0, false)
    assert.equal(confirmation.update(6, 0, true), false)
  }
  for (const cents of [5, -5]) {
    assert.equal(confirmation.update(6, cents, false), false)
    assert.equal(confirmation.update(6, 0, false), false)
    assert.equal(confirmation.update(6, 0, true), true)
  }
  assert.equal(confirmation.update(5, 0, true), true)
  confirmation.reset()
  assert.equal(confirmation.update(5, 0, true), true)
})

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const audios = [], states = []
  const sound = createSuccessSound(() => {
    const audio = { plays: 0, stops: 0, destroyed: 0,
      play() { this.plays++ }, stop() { this.stops++ }, destroy() { this.destroyed++ },
      onEnded(fn) { this.ended = fn }, onError(fn) { this.error = fn } }
    audios.push(audio)
    return audio
  }, value => states.push(value))
  return { sound, audios, states }
}

for (const event of ['ended', 'error', 'stop', 'timeout']) {
  test(`${event} releases playback and allows another sound without stale callbacks`, t => {
    const { sound, audios, states } = setup(t)
    assert.equal(sound.play(), true)
    assert.equal(sound.play(), false)
    assert.equal(audios[0].src, '/assets/tuning-success.wav')
    assert.equal(audios[0].plays, 1)
    if (event === 'stop') sound.stop()
    else if (event === 'timeout') t.mock.timers.tick(1000)
    else audios[0][event]()
    assert.deepEqual(states, [true, false])
    assert.equal(audios[0].destroyed, 1)
    assert.equal(sound.play(), true)
    audios[0].ended()
    audios[0].error()
    assert.deepEqual(states, [true, false, true])
    sound.stop()
    sound.stop()
    t.mock.timers.tick(1000)
    assert.deepEqual(states, [true, false, true, false])
    assert.equal(audios[1].destroyed, 1)
  })
}

test('a synchronous playback failure clears playing state', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const states = []
  const sound = createSuccessSound(() => ({ onEnded() {}, onError() {}, stop() {}, destroy() {},
    play() { throw new Error('play failed') } }), value => states.push(value))
  assert.equal(sound.play(), false)
  assert.deepEqual(states, [true, false])
})

test('audio creation and cleanup exceptions do not leave playback stuck', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const states = []
  const unavailable = createSuccessSound(() => { throw new Error('audio unavailable') }, value => states.push(value))
  assert.equal(unavailable.play(), false)
  assert.deepEqual(states, [])
  const sound = createSuccessSound(() => ({ onEnded() {}, onError() {}, play() {},
    stop() { throw new Error('stop failed') }, destroy() { throw new Error('destroy failed') } }), value => states.push(value))
  assert.equal(sound.play(), true)
  assert.doesNotThrow(() => sound.stop())
  assert.deepEqual(states, [true, false])
})

test('the generated doorbell is 500ms mono 16-bit PCM with soft endpoints and no clipping', () => {
  const wav = readFileSync(new URL('../miniprogram/assets/tuning-success.wav', import.meta.url))
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(4), wav.length - 8)
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ')
  assert.equal(wav.readUInt16LE(20), 1)
  assert.equal(wav.readUInt16LE(22), 1)
  assert.equal(wav.readUInt16LE(34), 16)
  assert.equal(wav.readUInt32LE(40), wav.length - 44)
  assert.equal((wav.length - 44) / 2 / wav.readUInt32LE(24), .5)
  const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2))
  assert.equal(samples[0], 0)
  assert.ok(Math.abs(samples.at(-1)) < 10)
  const peak = Math.max(...samples.map(Math.abs))
  assert.ok(peak > 1000 && peak < 32767)
  const rate = wav.readUInt32LE(24)
  const energy = (frequency, start, end) => {
    let sine = 0, cosine = 0
    for (let i = Math.round(start * rate); i < end * rate; i++) {
      sine += samples[i] * Math.sin(2 * Math.PI * frequency * i / rate)
      cosine += samples[i] * Math.cos(2 * Math.PI * frequency * i / rate)
    }
    return sine ** 2 + cosine ** 2
  }
  assert.ok(energy(880, .03, .15) > 4 * energy(698.456, .03, .15), 'The first note is higher')
  assert.ok(energy(698.456, .21, .33) > 4 * energy(880, .21, .33), 'A distinct lower note follows promptly')
})
