import { useState, useSyncExternalStore } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, InjectFace, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpeechSelectionPatch } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { SpeechReadiness } from './readiness.ts'
import type { Preferences } from './preferences.ts'
import { NS } from './locales.ts'
import { Models } from './Models.tsx'
import type { LocalModel } from './preferences.ts'
import css from './VoiceInput.module.css'

/** Plugin controls remain available when the input replacement is withdrawn. */
export interface SettingsInjected {
  form: ConfigForm<Preferences>
  openRecognition: () => void
  configure: (patch: SpeechSelectionPatch) => Promise<void>
  hooks: { speechReadiness: HostObservable<SpeechReadiness> }
}

export function Settings({ form, openRecognition, configure, useSpeechReadiness, t }: InjectFace<SettingsInjected> & PropsLocale<typeof NS>) {
  const readiness = useSpeechReadiness(value => value), catalog = readiness.catalog
  const snapshot = useSyncExternalStore(form.subscribe, form.getSnapshot)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<Partial<Preferences>>({})
  const value = snapshot.value
  const writable = snapshot.status === 'ready' && snapshot.writable && !!value && !busy
  const save = async (field: keyof Preferences, next: boolean | number | LocalModel[]) => {
    setBusy(true); setError(''); setPending({ [field]: next })
    try { if (!await form.set(field, next)) { setError(t('saveRefused')); return false }; return true }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return false }
    finally { setBusy(false); setPending({}) }
  }
  const select = async (id: string) => {
    const provider = catalog?.providers.find(row => row.id === id)
    if (!provider || !catalog) return
    setBusy(true); setError('')
    try { await configure({ providerId: provider.id, language: provider.languages.includes(catalog.selection.language) ? catalog.selection.language : provider.languages[0]! }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  return <div className={css.preferences} data-speech-enhancement-settings>
    <p>{t('enhancementHelp')}</p>
    {(['enhancedInput', 'silenceDetection', 'autoSend', 'autoRead'] as const).map(field => <label key={field}>
      <input type="checkbox" checked={pending[field] ?? value?.[field] ?? false} disabled={!writable} onChange={event => { void save(field, event.target.checked) }} />{t(field)}
    </label>)}
    <label>{t('silenceThreshold')}<Input type="number" aria-label={t('silenceThreshold')} min={0.001} max={1} step={0.001}
      key={`threshold:${value?.silenceThreshold}`} defaultValue={value?.silenceThreshold} disabled={!writable}
      onBlur={event => { const next = Number(event.target.value); if (next !== value?.silenceThreshold) void save('silenceThreshold', next) }} /></label>
    <label>{t('silenceDuration')}<Input type="number" aria-label={t('silenceDuration')} min={200} max={10000} step={100}
      key={`duration:${value?.silenceDurationMs}`} defaultValue={value?.silenceDurationMs} disabled={!writable}
      onBlur={event => { const next = Number(event.target.value); if (next !== value?.silenceDurationMs) void save('silenceDurationMs', next) }} /></label>
    <p>{t('autoReadHelp')}</p>
    <Models models={pending.models ?? value?.models ?? []} writable={writable} save={models => save('models', models)} t={t} />
    <label>{t('provider')}<select aria-label={t('provider')} disabled={busy || !readiness.connected || !catalog}
      value={catalog?.providers.some(row => row.id === catalog.selection.providerId) ? catalog.selection.providerId : ''}
      onChange={event => { void select(event.target.value) }}>
      <option value="" disabled>{t('chooseProvider')}</option>
      {catalog?.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
    </select></label>
    <Button variant="outline" onClick={openRecognition}>{t('recognitionSettings')}</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
