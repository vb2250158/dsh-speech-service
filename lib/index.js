// src/settings.mjs
import z from "@deepseek-ai/schemastery";
var SettingsSchema = z.object({
  enhancedInput: z.boolean().default(true),
  silenceDetection: z.boolean().default(true),
  autoSend: z.boolean().default(true),
  autoRead: z.boolean().default(false),
  silenceThreshold: z.number().min(1e-3).max(1).default(0.01),
  silenceDurationMs: z.number().step(1).min(200).max(1e4).default(1e3)
});
var Config = SettingsSchema.volatile().default({});

// src/index.mjs
var name = "dsh-speech-service";
var inject = ["settings"];
function apply(ctx) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
}
export {
  Config,
  apply,
  inject,
  name
};
