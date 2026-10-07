import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { SettingsSchema } from '../settings.mjs'

/** Values owned by the enhancement plugin, never by the upstream recognizer. */
export interface LocalModel {
  id: string
  name: string
  engine: 'funasr' | 'faster-whisper'
  modelPath: string
  pythonExecutable: string
  device: string
  computeType: string
  languages: string[]
  enabled: boolean
}

export interface Preferences {
  enhancedInput: boolean
  silenceDetection: boolean
  autoSend: boolean
  autoRead: boolean
  silenceThreshold: number
  silenceDurationMs: number
  models: LocalModel[]
  workerTimeoutMs: number
  workerGraceMs: number
  maxWorkerOutputBytes: number
  maxConcurrentRecognitions: number
}

/** Decode the public settings mirror while preserving ConfigForm revision fences. */
export function preferencesForm(form: ConfigForm<Preferences>, mirror: ReturnType<import('@deepseek-ai/dsh-client-ui-settings/client').ConfigForms['describe']>): ConfigForm<Preferences> {
  let previousForm: object | undefined, previousMirror: object | undefined, snapshot: ReturnType<typeof form.getSnapshot>
  return {
    getSnapshot() {
      const base = form.getSnapshot(), document = mirror.getSnapshot()
      if (base === previousForm && document === previousMirror) return snapshot
      previousForm = base; previousMirror = document
      snapshot = { ...base }
      const section = document.view?.namespaces.find(entry => entry.ns === 'dsh-speech-service')
      if (base.mode !== 'memory' && section?.value !== undefined) {
        try { snapshot.value = SettingsSchema(section.value); snapshot.status = 'ready' }
        catch (_invalidSettings) { snapshot.value = undefined; snapshot.status = 'unavailable' }
      }
      return snapshot
    },
    subscribe(listener) { const a = form.subscribe(listener), b = mirror.subscribe(listener); return () => { a(); b() } },
    mutate: (ops, revision) => form.mutate(ops, revision),
    set: (field, value) => form.set(field, value),
    unset: field => form.unset(field),
  }
}
