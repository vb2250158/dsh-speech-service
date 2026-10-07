import z from '@deepseek-ai/schemastery'

/** One local checkpoint and its installed Python inference backend. */
export const ModelSchema = z.object({
  id: z.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).required(),
  name: z.string().min(1).required(),
  engine: z.union(['funasr', 'faster-whisper']).default('funasr'),
  modelPath: z.string().pattern(/^(?:[A-Za-z]:[\\/]|\/|\\\\)/).required(),
  pythonExecutable: z.string().min(1).default('python'),
  device: z.string().min(1).default('cpu'),
  computeType: z.string().min(1).default('int8'),
  languages: z.array(z.string().pattern(/^(?:auto|[a-z]{2,3}(?:-[a-zA-Z]+)?)$/)).min(1).default(['auto', 'zh', 'en']),
  enabled: z.boolean().default(true),
})
const ModelsSchema = z.transform(z.array(ModelSchema).max(32).default([]), models => {
  if (new Set(models.map(model => model.id)).size !== models.length) throw new TypeError('ASR model ids must be unique')
  return models
}).default([])

/** Each enhancement can be withdrawn independently when upstream replaces it. */
export const SettingsSchema = z.object({
  enhancedInput: z.boolean().default(true),
  silenceDetection: z.boolean().default(true),
  autoSend: z.boolean().default(true),
  autoRead: z.boolean().default(false),
  silenceThreshold: z.number().min(0.001).max(1).default(0.01),
  silenceDurationMs: z.number().step(1).min(200).max(10000).default(1000),
  models: ModelsSchema,
  workerTimeoutMs: z.number().step(1).min(1000).max(3600000).default(300000),
  workerGraceMs: z.number().step(1).min(1).max(10000).default(1000),
  maxWorkerOutputBytes: z.number().step(1).min(1024).max(1048576).default(131072),
  maxConcurrentRecognitions: z.number().step(1).min(1).max(8).default(1),
})
export const Config = SettingsSchema.volatile().default({})
