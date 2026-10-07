export { Config } from './settings.mjs'
export const name = 'dsh-speech-service'
export const inject = ['settings']

/** Preferences are written by the upstream ConfigForm service, in this entry only. */
export function apply(ctx) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
}
