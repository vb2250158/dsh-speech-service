import z from '@deepseek-ai/schemastery'

/** Each enhancement can be withdrawn independently when upstream replaces it. */
export const SettingsSchema = z.object({
  enhancedInput: z.boolean().default(true),
  silenceDetection: z.boolean().default(true),
  autoSend: z.boolean().default(true),
  autoRead: z.boolean().default(false),
  silenceThreshold: z.number().min(0.001).max(1).default(0.01),
  silenceDurationMs: z.number().step(1).min(200).max(10000).default(1000),
})
export const Config = SettingsSchema.volatile().default({})
