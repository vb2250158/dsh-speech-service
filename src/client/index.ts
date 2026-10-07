import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Recording } from './audio.ts'
import { VoiceInput, type VoiceInputInjected } from './VoiceInput.tsx'
import { observeReadiness } from './readiness.ts'
import { preferencesForm, type Preferences } from './preferences.ts'
import { Settings } from './Settings.tsx'
import { RabiAutoSpeech } from './auto-read.js'
import { rabiSpeechLocales } from './reply-player.js'
import { NS, en, zh } from './locales.ts'

export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.speech', 'pluginNavigation']

/** Mount public slot replacements and withdraw every capture and observation on unload. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  ctx.effect(() => ctx.locale.register('speech-service-readback', rabiSpeechLocales))
  const form = preferencesForm(ctx.configForms.get<Preferences>('dsh-speech-service'), ctx.configForms.describe())
  const recordings = new Set<Recording>()
  const readiness = observeReadiness(ctx, form)
  ctx.effect(() => readiness.dispose)
  ctx.effect(() => async () => { await Promise.all([...recordings].map(recording => recording.dispose())) })
  const openRecognition = () => { ctx.pluginNavigation.openBundle('@deepseek-ai/dsh-experimental-voice-input-bundle') }
  const actions: VoiceInputInjected = {
    openSettings: openRecognition,
    hooks: { speechReadiness: readiness.state },
    createRecording: () => { const capture = new Recording(() => { recordings.delete(capture) }); recordings.add(capture); return capture },
    transcribe: (request, signal) => ctx.remote.speech.transcribe(request, signal),
    configure: async patch => { const result = await ctx.remote.speech.configure(patch); if (!result.ok) throw result.error },
    prepare: async (id, options) => { const result = await ctx.remote.speech.prepare(id, options); if (!result.ok) throw result.error },
    cancelPreparation: async id => { const result = await ctx.remote.speech.cancelPreparation(id); if (!result.ok) throw result.error },
  }
  let inputDispose: (() => void) | undefined
  const syncInput = () => {
    const snapshot = form.getSnapshot()
    const enabled = snapshot.status === 'ready' && snapshot.value?.enhancedInput === true
    if (enabled && !inputDispose) inputDispose = ctx.slots.inject('conversation.input.activity', () => ctx.slots.register({
      name: 'conversation.input.activity', priority: -100, locale: NS, inject: () => actions,
    }, VoiceInput))
    else if (!enabled && inputDispose) { inputDispose(); inputDispose = undefined }
  }
  ctx.effect(() => form.subscribe(syncInput))
  ctx.effect(() => () => { inputDispose?.(); inputDispose = undefined })
  syncInput()
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-speech-service', locale: NS,
    inject: () => ({ form, openRecognition, configure: actions.configure, hooks: { speechReadiness: readiness.state } }),
  }, Settings))
  const autoRead = { getSnapshot: () => form.getSnapshot().status === 'ready' && form.getSnapshot().value?.autoRead === true,
    subscribe: (listener: () => void) => form.subscribe(listener) }
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'speech-service-auto-read', order: 35, locale: 'speech-service-readback',
    inject: () => ({ hooks: { rabiAutoRead: autoRead } }),
  }, props => React.createElement(RabiAutoSpeech, { ...props, key: props.sessionId })))
}
