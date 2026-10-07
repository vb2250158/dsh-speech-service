import { useState, useSyncExternalStore } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Preferences } from './preferences.ts'
import { NS } from './locales.ts'
import css from './VoiceInput.module.css'

/** Plugin controls remain available when the input replacement is withdrawn. */
export function Settings({ form, openRecognition, t }: { form: ConfigForm<Preferences>; openRecognition: () => void } & PropsLocale<typeof NS>) {
  const snapshot = useSyncExternalStore(form.subscribe, form.getSnapshot)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<Partial<Preferences>>({})
  const value = snapshot.value
  const writable = snapshot.status === 'ready' && snapshot.writable && !!value && !busy
  const save = async (field: keyof Preferences, next: boolean | number) => {
    setBusy(true); setError(''); setPending({ [field]: next })
    try { if (!await form.set(field, next)) setError(t('saveRefused')) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setPending({}) }
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
    <Button variant="outline" onClick={openRecognition}>{t('recognitionSettings')}</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
