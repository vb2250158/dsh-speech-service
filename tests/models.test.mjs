import test from 'node:test'
import assert from 'node:assert/strict'
import { SettingsSchema, ModelSchema } from '../src/settings.mjs'
import { registerModels, transcribeModel } from '../src/models.mjs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const model = (id = 'one') => ModelSchema({ id, name: id, modelPath: '/local/model' })
test('existing preferences acquire empty models without changing enhancements', () => {
  const value = SettingsSchema({ autoSend: false, autoRead: true })
  assert.deepEqual(value.models, [])
  assert.equal(value.autoSend, false); assert.equal(value.autoRead, true)
})
test('model config rejects relative paths, duplicate ids, unsupported engines and empty languages', () => {
  for (const patch of [{ modelPath: 'models/whisper' }, { engine: 'unknown' }, { languages: [] }, { id: 'bad id' }]) {
    assert.throws(() => ModelSchema({ ...model(), ...patch }))
  }
  assert.throws(() => SettingsSchema({ models: [model(), model()] }))
  assert.equal(ModelSchema({ ...model(), modelPath: 'C:\\Models\\whisper' }).modelPath, 'C:\\Models\\whisper')
})
test('live edits retain unchanged registrations, withdraw disabled models, and dispose all on unload', async () => {
  let settings = SettingsSchema({ models: [model(), model('two')] })
  const live = new Map(), removed = [], effects = []
  let update
  const ctx = { logger: { error: assert.fail }, on: (_name, listener) => { update = listener }, effect: effect => effects.push(effect()),
    speechToText: { register: provider => {
      assert.ok(!live.has(provider.info.id)); live.set(provider.info.id, provider)
      return async () => { live.delete(provider.info.id); removed.push(provider.info.id) }
    } } }
  registerModels(ctx, { get: () => settings })
  const original = live.get('speech-service:one')
  settings = { ...settings, autoSend: false }; update()
  assert.equal(live.get('speech-service:one'), original)
  settings = { ...settings, models: [{ ...model(), name: 'renamed' }, { ...model('two'), enabled: false }] }; update()
  assert.notEqual(live.get('speech-service:one'), original)
  assert.equal(live.get('speech-service:one').info.name, 'renamed')
  assert.ok(!live.has('speech-service:two'))
  await effects[0]()
  assert.equal(live.size, 0)
  assert.deepEqual(removed.sort(), ['speech-service:one', 'speech-service:one', 'speech-service:two'])
})
test('worker results cross a validated file protocol and temporary audio is removed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asr-model-test-'))
  let request, stopped = false, joined = false
  try {
    const ctx = { subprocess: { resolveExecutable: async executable => executable, spawn: spec => {
      request = JSON.parse(spec.stdio.stdin.data)
      assert.equal(spec.env.HF_HUB_OFFLINE, '1')
      assert.deepEqual(spec.argv.slice(-1), [fileURLToPath(new URL('../scripts/asr-worker.py', import.meta.url))])
      return { collected: {}, done: writeFile(request.resultPath, JSON.stringify({ text: '测试', audioSeconds: 1, inferenceSeconds: 0.1 })).then(() => ({ exitCode: 0 })),
        terminate: () => { stopped = true }, waitForExit: async () => { joined = true; return true } }
    } }, logger: { warn() {} } }
    const transcript = await transcribeModel(ctx, { ...model(), modelPath: dir }, SettingsSchema({}), { audio: new Uint8Array([1, 2]), language: 'auto' }, new AbortController().signal)
    assert.equal(transcript.text, '测试'); assert.ok(stopped && joined)
    await assert.rejects(readFile(request.audioPath), /ENOENT/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
