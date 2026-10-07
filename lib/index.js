// src/settings.mjs
import z from "@deepseek-ai/schemastery";
var ModelSchema = z.object({
  id: z.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).required(),
  name: z.string().min(1).required(),
  engine: z.union(["funasr", "faster-whisper"]).default("funasr"),
  modelPath: z.string().pattern(/^(?:[A-Za-z]:[\\/]|\/|\\\\)/).required(),
  pythonExecutable: z.string().min(1).default("python"),
  device: z.string().min(1).default("cpu"),
  computeType: z.string().min(1).default("int8"),
  languages: z.array(z.string().pattern(/^(?:auto|[a-z]{2,3}(?:-[a-zA-Z]+)?)$/)).min(1).default(["auto", "zh", "en"]),
  enabled: z.boolean().default(true)
});
var ModelsSchema = z.transform(z.array(ModelSchema).max(32).default([]), (models) => {
  if (new Set(models.map((model) => model.id)).size !== models.length) throw new TypeError("ASR model ids must be unique");
  return models;
}).default([]);
var SettingsSchema = z.object({
  enhancedInput: z.boolean().default(true),
  silenceDetection: z.boolean().default(true),
  autoSend: z.boolean().default(true),
  autoRead: z.boolean().default(false),
  silenceThreshold: z.number().min(1e-3).max(1).default(0.01),
  silenceDurationMs: z.number().step(1).min(200).max(1e4).default(1e3),
  models: ModelsSchema,
  workerTimeoutMs: z.number().step(1).min(1e3).max(36e5).default(3e5),
  workerGraceMs: z.number().step(1).min(1).max(1e4).default(1e3),
  maxWorkerOutputBytes: z.number().step(1).min(1024).max(1048576).default(131072),
  maxConcurrentRecognitions: z.number().step(1).min(1).max(8).default(1)
});
var Config = SettingsSchema.volatile().default({});

// src/models.mjs
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
async function transcribeModel(ctx, model, settings, input, signal) {
  signal.throwIfAborted();
  await access(model.modelPath);
  const python = await ctx.subprocess.resolveExecutable(model.pythonExecutable, void 0, signal);
  const directory = await mkdtemp(join(tmpdir(), "dsh-asr-"));
  const callId = randomUUID();
  const logs = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "logs", "speech-service");
  const log = join(logs, callId + ".log"), record = join(logs, callId + ".json");
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("ASR recognition timed out")), settings.workerTimeoutMs);
  const combined = AbortSignal.any([signal, deadline.signal]);
  let handle;
  try {
    await mkdir(logs, { recursive: true });
    const audioPath = join(directory, "audio.wav"), resultPath = join(directory, "result.json");
    await writeFile(audioPath, input.audio);
    const runner = fileURLToPath(new URL("../scripts/asr-worker.py", import.meta.url));
    handle = ctx.subprocess.spawn({
      argv: [python, runner],
      cwd: dirname(runner),
      signal: combined,
      graceMs: settings.workerGraceMs,
      env: { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      stdio: {
        stdin: { data: JSON.stringify({ model, language: input.language, audioPath, resultPath, log, record, callId }) },
        stdout: { maxBytes: settings.maxWorkerOutputBytes },
        stderr: { maxBytes: settings.maxWorkerOutputBytes }
      }
    });
    const outcome = await handle.done;
    combined.throwIfAborted();
    if (outcome.exitCode !== 0) throw new Error(`ASR ${model.name} failed (exit ${outcome.exitCode}): ${handle.collected.stderr?.readFrom(0).text ?? ""}`);
    const raw = await readFile(resultPath, "utf8");
    if (Buffer.byteLength(raw) > settings.maxWorkerOutputBytes) throw new Error("ASR transcript exceeds output limit");
    const result = JSON.parse(raw);
    if (typeof result.text !== "string" || !Number.isFinite(result.audioSeconds) || result.audioSeconds < 0 || !Number.isFinite(result.inferenceSeconds) || result.inferenceSeconds < 0) throw new Error("ASR worker returned invalid transcript fields");
    return result;
  } finally {
    clearTimeout(timer);
    if (handle) {
      handle.terminate();
      await handle.done.catch(() => {
      });
      await handle.waitForExit();
    }
    if (combined.aborted) {
      try {
        const facts = JSON.parse(await readFile(record, "utf8"));
        await writeFile(record, JSON.stringify({ ...facts, state: "cancelled", finishedAt: Date.now() / 1e3 }));
      } catch (failure) {
        ctx.logger.warn("ASR worker did not write a readable process record", failure);
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}
function registerModels(ctx, config) {
  const registrations = /* @__PURE__ */ new Map();
  const removals = /* @__PURE__ */ new Set();
  let active = 0;
  const sync = () => {
    const settings = config.get();
    const wanted = new Map(settings.models.filter((model) => model.enabled).map((model) => [model.id, model]));
    for (const [id, registration] of registrations) {
      if (JSON.stringify(wanted.get(id)) === registration.key) continue;
      registrations.delete(id);
      const pending = registration.dispose();
      removals.add(pending);
      void pending.finally(() => removals.delete(pending)).catch((error) => ctx.logger.error(error));
    }
    for (const [id, model] of wanted) {
      if (registrations.has(id)) continue;
      const dispose = ctx.speechToText.register({
        info: { id: `speech-service:${id}`, name: model.name, location: "host-local", languages: model.languages },
        transcribe: async (input, signal) => {
          const settings2 = config.get();
          if (active >= settings2.maxConcurrentRecognitions) throw new Error("ASR is busy; retry after the current recognition finishes");
          active++;
          try {
            return await transcribeModel(ctx, model, settings2, input, signal);
          } finally {
            active--;
          }
        }
      });
      registrations.set(id, { key: JSON.stringify(model), dispose });
    }
  };
  ctx.on("loader/volatile-update", sync);
  ctx.effect(() => {
    sync();
    return async () => {
      await Promise.all([...registrations.values()].map((row) => row.dispose()));
      await Promise.allSettled(removals);
      registrations.clear();
    };
  });
}

// src/index.mjs
var name = "dsh-speech-service";
var inject = ["settings", "speechToText", "subprocess"];
function apply(ctx, config) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
  registerModels(ctx, config);
}
export {
  Config,
  apply,
  inject,
  name
};
