import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = (await readFile(new URL('../src/client/auto-read.js', import.meta.url), 'utf8'))
  .replace(/^import [^\r\n]*\r?\n/gmu, '').replace(/^export /gmu, '')
const context = { Error, document: { hidden: false }, React: {} }
vm.runInNewContext(source + '\nglobalThis.api = { createRabiReplyGate }', context)
const reply = (seq, extra = {}) => ({ seq, kind: 'assistant', messageId: `reply-${seq}`, blocks: [{ kind: 'text', text: 'Reply' }], ...extra })
const snapshot = (...eventNodes) => ({ eventNodes })
const ids = value => Array.from(value)

test('initial history, disabled replies, reconnect and repeated projection never trigger reading', () => {
  const gate = context.api.createRabiReplyGate()
  assert.deepEqual(ids(gate.take(snapshot(reply(1)), false, true)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(1)), true, true)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(1), reply(2)), true, false)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(1), reply(2)), true, true)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(3), reply(4)), true, true)), ['reply-3', 'reply-4'])
  assert.deepEqual(ids(gate.take(snapshot(reply(3), reply(4)), true, true)), [])
  gate.take(snapshot(), false, true)
  assert.deepEqual(ids(gate.take(snapshot(reply(3), reply(4), reply(5)), true, true)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(6)), true, true)), ['reply-6'])
})

test('only finalized reply bodies qualify; reasoning, tools, empty text and interruptions are excluded', () => {
  const gate = context.api.createRabiReplyGate()
  gate.take(snapshot(), true, true)
  const nodes = [reply(1, { blocks: [{ kind: 'reasoning', text: 'Private thought' }] }),
    reply(2, { blocks: [{ kind: 'text', text: 'Calling a tool' }, { kind: 'tool-call' }] }),
    reply(3, { blocks: [{ kind: 'text', text: '  ' }] }), reply(4, { interrupted: true }),
    reply(5, { messageId: undefined }), reply(6)]
  assert.deepEqual(ids(gate.take(snapshot(...nodes), true, true)), ['reply-6'])
})

test('hidden-page reset seeds the resumed history rather than reading missed replies', () => {
  const gate = context.api.createRabiReplyGate()
  gate.take(snapshot(reply(1)), true, true)
  gate.reset()
  assert.deepEqual(ids(gate.take(snapshot(reply(2)), true, true)), [])
  assert.deepEqual(ids(gate.take(snapshot(reply(3)), true, true)), ['reply-3'])
})
