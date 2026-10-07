import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

/** Run one backend under the public managed subprocess service; retain diagnostics, never audio. */
export async function transcribeModel(ctx, model, settings, input, signal) {
  signal.throwIfAborted()
  await access(model.modelPath)
  const python = await ctx.subprocess.resolveExecutable(model.pythonExecutable, undefined, signal)
  const directory = await mkdtemp(join(tmpdir(), 'dsh-asr-'))
  const callId = randomUUID()
  const logs = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'logs', 'speech-service')
  const log = join(logs, callId + '.log'), record = join(logs, callId + '.json')
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(new Error('ASR recognition timed out')), settings.workerTimeoutMs)
  const combined = AbortSignal.any([signal, deadline.signal])
  let handle
  try {
    await mkdir(logs, { recursive: true })
    const audioPath = join(directory, 'audio.wav'), resultPath = join(directory, 'result.json')
    await writeFile(audioPath, input.audio)
    const runner = fileURLToPath(new URL('../scripts/asr-worker.py', import.meta.url))
    handle = ctx.subprocess.spawn({ argv: [python, runner], cwd: dirname(runner), signal: combined,
      graceMs: settings.workerGraceMs,
      env: { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      stdio: { stdin: { data: JSON.stringify({ model, language: input.language, audioPath, resultPath, log, record, callId }) },
        stdout: { maxBytes: settings.maxWorkerOutputBytes }, stderr: { maxBytes: settings.maxWorkerOutputBytes } } })
    const outcome = await handle.done
    combined.throwIfAborted()
    if (outcome.exitCode !== 0) throw new Error(`ASR ${model.name} failed (exit ${outcome.exitCode}): ${handle.collected.stderr?.readFrom(0).text ?? ''}`)
    const raw = await readFile(resultPath, 'utf8')
    if (Buffer.byteLength(raw) > settings.maxWorkerOutputBytes) throw new Error('ASR transcript exceeds output limit')
    const result = JSON.parse(raw)
    if (typeof result.text !== 'string' || !Number.isFinite(result.audioSeconds) || result.audioSeconds < 0 || !Number.isFinite(result.inferenceSeconds) || result.inferenceSeconds < 0) throw new Error('ASR worker returned invalid transcript fields')
    return result
  } finally {
    clearTimeout(timer)
    if (handle) {
      handle.terminate()
      await handle.done.catch(() => { /* Spawn failures are reported by the awaited outcome. */ })
      await handle.waitForExit()
    }
    if (combined.aborted) {
      try {
        const facts = JSON.parse(await readFile(record, 'utf8'))
        await writeFile(record, JSON.stringify({ ...facts, state: 'cancelled', finishedAt: Date.now() / 1000 }))
      } catch (failure) { ctx.logger.warn('ASR worker did not write a readable process record', failure) }
    }
    await rm(directory, { recursive: true, force: true })
  }
}

/** Reconcile live model preferences; retain unchanged providers and cancel withdrawn work. */
export function registerModels(ctx, config) {
  const registrations = new Map()
  const removals = new Set()
  let active = 0
  const sync = () => {
    const settings = config.get()
    const wanted = new Map(settings.models.filter(model => model.enabled).map(model => [model.id, model]))
    for (const [id, registration] of registrations) {
      if (JSON.stringify(wanted.get(id)) === registration.key) continue
      registrations.delete(id)
      const pending = registration.dispose()
      removals.add(pending)
      void pending.finally(() => removals.delete(pending)).catch(error => ctx.logger.error(error))
    }
    for (const [id, model] of wanted) {
      if (registrations.has(id)) continue
      const dispose = ctx.speechToText.register({
        info: { id: `speech-service:${id}`, name: model.name, location: 'host-local', languages: model.languages },
        transcribe: async (input, signal) => {
          const settings = config.get()
          if (active >= settings.maxConcurrentRecognitions) throw new Error('ASR is busy; retry after the current recognition finishes')
          active++
          try { return await transcribeModel(ctx, model, settings, input, signal) }
          finally { active-- }
        },
      })
      registrations.set(id, { key: JSON.stringify(model), dispose })
    }
  }
  ctx.on('loader/volatile-update', sync)
  ctx.effect(() => {
    sync()
    return async () => {
      await Promise.all([...registrations.values()].map(row => row.dispose()))
      await Promise.allSettled(removals)
      registrations.clear()
    }
  })
}
