import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocalModel } from './preferences.ts'
import { ModelSchema } from '../settings.mjs'
import { NS } from './locales.ts'
import css from './VoiceInput.module.css'

/** Edit one checkpoint at a time; writes retain the original provider identity. */
export function Models({ models, writable, save, t }: {
  models: LocalModel[]; writable: boolean; save: (models: LocalModel[]) => Promise<boolean>
} & PropsLocale<typeof NS>) {
  const [draft, setDraft] = useState<LocalModel>(), [error, setError] = useState('')
  const [languages, setLanguages] = useState('auto,zh,en')
  const edit = (model: LocalModel) => { setDraft({ ...model }); setLanguages(model.languages.join(',')); setError('') }
  const add = () => edit({ ...ModelSchema({ id: crypto.randomUUID(), name: 'draft', modelPath: '/draft' }), name: '', modelPath: '' })
  const submit = async () => {
    if (!draft) return
    try {
      const model = ModelSchema({ ...draft, name: draft.name.trim(), modelPath: draft.modelPath.trim(), languages: languages.split(',').map(value => value.trim()).filter(Boolean) })
      const next = models.some(row => row.id === model.id) ? models.map(row => row.id === model.id ? model : row) : [...models, model]
      if (await save(next)) { setDraft(undefined); setError('') }
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  return <section data-asr-models className={css.models}>
    <h4>{t('modelsTitle')}</h4><p>{t('modelsHelp')}</p>
    {models.length === 0 && <p>{t('modelsEmpty')}</p>}
    {models.map(model => <div key={model.id} className={css.modelRow}>
      <strong>{model.name}</strong><span>{model.engine}</span><code>{model.modelPath}</code>
      <label><input type="checkbox" checked={model.enabled} disabled={!writable}
        onChange={event => { void save(models.map(row => row.id === model.id ? { ...row, enabled: event.target.checked } : row)) }} />{t('modelEnabled')}</label>
      <Button variant="outline" disabled={!writable} onClick={() => edit(model)}>{t('editModel')}</Button>
      <Button variant="outline" disabled={!writable} onClick={() => { void save(models.filter(row => row.id !== model.id)) }}>{t('removeModel')}</Button>
    </div>)}
    {!draft && <Button variant="outline" disabled={!writable || models.length >= 32} onClick={add}>{t('addModel')}</Button>}
    {draft && <div className={css.modelEditor}>
      <label>{t('modelName')}<Input aria-label={t('modelName')} value={draft.name} disabled={!writable} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>{t('modelEngine')}<select aria-label={t('modelEngine')} value={draft.engine} disabled={!writable}
        onChange={event => setDraft({ ...draft, engine: event.target.value === 'funasr' ? 'funasr' : 'faster-whisper' })}>
        <option value="funasr">FunASR</option><option value="faster-whisper">faster-whisper</option>
      </select></label>
      {(['modelPath', 'pythonExecutable', 'device', 'computeType'] as const).map(field => <label key={field}>{t(field)}<Input aria-label={t(field)}
        value={draft[field]} disabled={!writable} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}
      <label>{t('modelLanguages')}<Input aria-label={t('modelLanguages')} value={languages} disabled={!writable} onChange={event => setLanguages(event.target.value)} /></label>
      <p>{t('computeHelp')}</p>
      <Button disabled={!writable} onClick={() => { void submit() }}>{t('saveModel')}</Button>
      <Button variant="outline" disabled={!writable} onClick={() => { setDraft(undefined); setError('') }}>{t('cancel')}</Button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>
}
