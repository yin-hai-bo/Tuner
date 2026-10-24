import assert from 'node:assert/strict'
import test from 'node:test'
import { createPcmRecorder } from '../miniprogram/utils/pcm-recorder.ts'

function createRecorder(removeFile = async () => {}) {
  const events = {}, states = [], frames = [], starts = [], removed = []
  let stops = 0
  const recorder = { start: options => starts.push(options), stop: () => stops++ }
  for (const name of ['Start', 'FrameRecorded', 'Stop', 'Error', 'InterruptionBegin', 'InterruptionEnd']) {
    recorder[`on${name}`] = callback => { events[name] = callback }
  }
  const controller = createPcmRecorder(recorder, frame => frames.push(frame), state => states.push(state), async path => {
    removed.push(path)
    await removeFile(path)
  })
  return { controller, recorder, events, states, frames, starts, removed, get stops() { return stops } }
}

test('start uses mono PCM frames, does not duplicate starts, and forwards only active frames', () => {
  const { controller, events, starts, states, frames } = createRecorder()
  const frame = new ArrayBuffer(4096)
  events.FrameRecorded({ frameBuffer: frame })
  assert.equal(controller.start(), true)
  assert.equal(controller.start(), false)
  events.FrameRecorded({ frameBuffer: frame })
  assert.equal(frames.length, 0)
  assert.deepEqual(starts, [{ duration: 600000, sampleRate: 16000, numberOfChannels: 1, format: 'PCM', frameSize: 4 }])
  events.Start()
  events.FrameRecorded({ frameBuffer: new ArrayBuffer(0) })
  events.FrameRecorded({ frameBuffer: frame })
  assert.deepEqual(states, ['starting', 'recording'])
  assert.deepEqual(frames, [frame])
})

for (const started of [false, true]) {
  test(`leaving while ${started ? 'recording' : 'starting'} stops once and ignores late frames`, async () => {
    const session = createRecorder()
    session.controller.start()
    if (started) session.events.Start()
    session.controller.stop()
    session.controller.stop()
    assert.equal(session.stops, 1)
    assert.equal(session.controller.start(), false)
    if (!started) {
      session.events.Start()
      assert.equal(session.stops, 2, 'A late start must be stopped again')
    }
    session.events.FrameRecorded({ frameBuffer: new ArrayBuffer(4096) })
    assert.equal(session.frames.length, 0)
    await session.events.Stop({ tempFilePath: 'wxfile://temporary.pcm' })
    assert.deepEqual(session.removed, ['wxfile://temporary.pcm'])
    assert.equal(session.states.at(-1), 'idle')
    assert.equal(session.controller.start(), true)
  })
}

test('restarting waits for temporary file removal to finish', async () => {
  let finish
  const session = createRecorder(() => new Promise(resolve => { finish = resolve }))
  session.controller.start()
  session.events.Start()
  const stopped = session.events.Stop({ tempFilePath: 'wxfile://temporary.pcm' })
  assert.equal(session.controller.start(), false)
  finish()
  await stopped
  assert.equal(session.states.at(-1), 'ended')
  assert.equal(session.starts.length, 1, 'Reaching the recording limit must not restart automatically')
})

test('interruption stops recording, ignores frames and never resumes automatically', async () => {
  const session = createRecorder()
  session.controller.start()
  session.events.Start()
  session.events.InterruptionBegin()
  assert.equal(session.states.at(-1), 'interrupted')
  assert.equal(session.stops, 1)
  session.events.InterruptionEnd()
  assert.equal(session.controller.start(), false, 'Interruption end must not bypass a pending stop')
  session.events.FrameRecorded({ frameBuffer: new ArrayBuffer(4096) })
  await session.events.Stop({ tempFilePath: 'wxfile://interrupted.pcm' })
  assert.equal(session.frames.length, 0)
  assert.equal(session.starts.length, 1)
  assert.equal(session.controller.start(), true)
})

test('synchronous start failure is reported, and idle interruption does not start or stop recording', () => {
  const session = createRecorder()
  session.controller.stop()
  session.events.InterruptionBegin()
  assert.equal(session.controller.start(), false)
  assert.equal(session.stops, 0)
  session.events.InterruptionEnd()
  session.recorder.start = () => { throw new Error('unsupported format') }
  assert.equal(session.controller.start(), false)
  assert.equal(session.states.at(-1), 'error')
})

test('recording and cleanup failures are reported instead of silently restarting', async () => {
  const session = createRecorder(async () => { throw new Error('unlink failed') })
  session.controller.start()
  session.events.Error({ errMsg: 'recording failed' })
  session.events.FrameRecorded({ frameBuffer: new ArrayBuffer(4096) })
  assert.equal(session.states.at(-1), 'error')
  assert.equal(session.frames.length, 0)
  assert.equal(session.controller.start(), false)
  await session.events.Stop({ tempFilePath: 'wxfile://failed.pcm' })
  assert.equal(session.states.at(-1), 'error')
  assert.deepEqual(session.removed, ['wxfile://failed.pcm'])
})
