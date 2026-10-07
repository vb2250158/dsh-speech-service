import type { Context } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpeechCatalog } from '@deepseek-ai/dsh-experimental-api-speech-to-text/types'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Preferences } from './preferences.ts'

/** Recognizer state with plugin-owned capture preferences composed at the consumer. */
export interface SpeechReadiness {
  catalog: (SpeechCatalog & { inputPreferences: Preferences }) | null
  connected: boolean
  error: string | null
}

/** One reconnecting upstream observation for the entire client plugin. */
export function observeReadiness(ctx: Context, form: ConfigForm<Preferences>): { state: HostObservable<SpeechReadiness>; dispose: () => Promise<void> } {
  let catalog: SpeechCatalog | null = null, connected = false, disposed = false, error: string | null = null
  let snapshot: SpeechReadiness = { catalog: null, connected: false, error: null }
  const listeners = new Set<() => void>()
  const update = () => {
    const config = form.getSnapshot()
    snapshot = { catalog: catalog && config.status === 'ready' && config.value ? { ...catalog, inputPreferences: config.value } : null, connected, error }
    for (const listener of listeners) listener()
  }
  const unsubscribe = form.subscribe(update)
  const stream = ctx.remote.$stream<SpeechCatalog>({ name: 'Speech service enhancements', open: signal => ctx.remote.speech.follow(signal),
    ended: () => new Error('Speech service disconnected'), carrierFailed: failure => { connected = false; error = String(failure); update() } })
  const observing = (async () => {
    try { for await (const item of stream) { if (disposed) break; catalog = item.value; connected = true; error = null; update(); item.accept() } }
    catch (failure) { if (!disposed) { connected = false; error = String(failure); update() } }
  })()
  return { state: { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    dispose: async () => { disposed = true; unsubscribe(); listeners.clear(); await stream.dispose(); await observing } }
}
