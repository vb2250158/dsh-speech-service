export { Config } from './settings.mjs'
import { registerModels } from './models.mjs'
export const name = 'dsh-speech-service'
export const inject = ['settings', 'speechToText', 'subprocess']

/** Preferences are written by the upstream ConfigForm service, in this entry only. */
export function apply(ctx, config) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
  registerModels(ctx, config)
}
