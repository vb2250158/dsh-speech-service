import type z from '@deepseek-ai/schemastery'
import type { Preferences, LocalModel } from './client/preferences.ts'
export const SettingsSchema: z<unknown, Preferences>
export const ModelSchema: z<Partial<LocalModel>, LocalModel>
