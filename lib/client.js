window.__ModuleLoader__.load({
 id: 'dsh-speech-service',
 factory: (require) => {
 var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React3 = __toESM(require("react"), 1);

// src/client/audio.ts
var RecordingError = class extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
    this.name = "RecordingError";
  }
  kind;
};
function encodeWave(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at, value) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16e3, true);
  view.setUint32(28, 32e3, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (const [i, sample] of samples.entries()) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
function audioBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
var Recording = class {
  constructor(onDispose) {
    this.onDispose = onDispose;
  }
  onDispose;
  stream;
  recorder;
  context;
  analyser;
  samples = new Float32Array(256);
  chunks = [];
  lifetime = new AbortController();
  disposal;
  /**
   * Acquire the microphone for this recording.
   * @param onError - receives failures during capture, before asynchronous resource release finishes.
   * @returns after capture starts; a cancelled permission grant immediately releases its tracks.
   */
  async start(onError) {
    const devices = navigator.mediaDevices;
    if (!devices || typeof MediaRecorder === "undefined") throw new RecordingError("unavailable");
    let stream;
    try {
      stream = await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") throw new RecordingError("permission");
      throw error;
    }
    if (this.lifetime.signal.aborted) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      throw new RecordingError("cancelled");
    }
    this.stream = stream;
    try {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.samples.length;
      this.context.createMediaStreamSource(stream).connect(this.analyser);
      this.recorder = new MediaRecorder(stream);
      this.recorder.ondataavailable = (event) => {
        if (!this.lifetime.signal.aborted && event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => {
        if (this.lifetime.signal.aborted) return;
        void this.dispose().catch(() => void 0);
        try {
          onError?.(new RecordingError("interrupted"));
        } catch (error) {
          console.error("Speech recording error handler failed", error);
        }
      };
      this.recorder.start();
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  /**
   * Read the live microphone signal.
   * @returns the measured RMS level, or zero outside capture.
   */
  amplitude() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    return Math.sqrt(sum / this.samples.length);
  }
  /**
   * Finish capture and resample the recording.
   * @param maxDurationSeconds - truncate timer overshoot to the Host limit.
   * @returns one recording after the final MediaRecorder chunk arrives.
   */
  async stop(maxDurationSeconds) {
    const recorder = this.recorder;
    const context = this.context;
    if (!recorder || !context || recorder.state !== "recording") {
      await this.dispose();
      throw new RecordingError("empty");
    }
    try {
      await new Promise((resolve2, reject) => {
        recorder.onstop = () => {
          resolve2();
        };
        recorder.onerror = () => {
          reject(new RecordingError("empty"));
        };
        recorder.stop();
      });
      this.stream?.getTracks().forEach((track) => {
        track.stop();
      });
      this.lifetime.signal.throwIfAborted();
      const blob = new Blob(this.chunks, { type: recorder.mimeType });
      if (blob.size === 0) throw new RecordingError("empty");
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      this.lifetime.signal.throwIfAborted();
      const offline = new OfflineAudioContext(1, Math.max(1, Math.floor(Math.min(decoded.duration, maxDurationSeconds) * 16e3)), 16e3);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const resampled = await offline.startRendering();
      this.lifetime.signal.throwIfAborted();
      return encodeWave(resampled.getChannelData(0));
    } finally {
      await this.dispose();
    }
  }
  /**
   * Release this recording and invalidate pending permission grants.
   * @returns the shared release promise, including any AudioContext close failure.
   */
  dispose() {
    if (!this.disposal) {
      const closing = Promise.withResolvers();
      this.disposal = closing.promise;
      void this.release().then(closing.resolve, closing.reject);
    }
    return this.disposal;
  }
  async release() {
    this.lifetime.abort(new RecordingError("cancelled"));
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.stream = void 0;
    const context = this.context;
    this.context = void 0;
    this.analyser = void 0;
    this.chunks = [];
    try {
      if (context && context.state !== "closed") await context.close();
    } finally {
      this.onDispose();
    }
  }
};

// src/client/VoiceInput.tsx
var import_react2 = require("react");

// src/client/Waveform.tsx
var import_react = require("react");

// src/client/VoiceInput.module.css
var VoiceInput_default = {
  trigger: "VoiceInput_trigger",
  triggerAnchor: "VoiceInput_triggerAnchor",
  captureRow: "VoiceInput_captureRow",
  roundButton: "VoiceInput_roundButton",
  waveform: "VoiceInput_waveform",
  activityMessage: "VoiceInput_activityMessage",
  inlineAction: "VoiceInput_inlineAction",
  preparation: "VoiceInput_preparation",
  preparationActions: "VoiceInput_preparationActions",
  preparationError: "VoiceInput_preparationError",
  downloadFailure: "VoiceInput_downloadFailure",
  summaryRow: "VoiceInput_summaryRow",
  summaryTitle: "VoiceInput_summaryTitle",
  metric: "VoiceInput_metric",
  progress: "VoiceInput_progress",
  steps: "VoiceInput_steps",
  stepBody: "VoiceInput_stepBody",
  stepProgress: "VoiceInput_stepProgress",
  preferences: "VoiceInput_preferences",
  sourceChoice: "VoiceInput_sourceChoice",
  models: "VoiceInput_models",
  modelEditor: "VoiceInput_modelEditor",
  modelRow: "VoiceInput_modelRow",
  settingsCard: "VoiceInput_settingsCard",
  setupEstimate: "VoiceInput_setupEstimate"
};

// src/client/Waveform.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function Waveform({ recording, label }) {
  const svg = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const bars = Array.from(svg.current.querySelectorAll("line")).reverse().map((element) => ({ element, level: 0 }));
    let frame, previous = -Infinity;
    const draw = (now) => {
      if (now - previous >= 50) {
        previous = now;
        let next = recording?.amplitude() ?? 0;
        for (const bar of bars) {
          const previousLevel = bar.level;
          bar.level = next;
          next = previousLevel;
          const height = 1 + Math.min(1, bar.level * 5) * 17;
          bar.element.setAttribute("y1", String(20 - height));
          bar.element.setAttribute("y2", String(20 + height));
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [recording]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ref: svg, className: VoiceInput_default.waveform, viewBox: "0 0 640 40", preserveAspectRatio: "none", role: "img", "aria-label": label, children: Array.from({ length: 80 }, (_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "line",
    {
      x1: index * 8 + 4,
      x2: index * 8 + 4,
      y1: "19",
      y2: "21",
      stroke: "currentColor",
      strokeWidth: "3",
      strokeLinecap: "round",
      opacity: 0.25 + index / 120
    },
    index
  )) });
}

// src/client/VoiceSetupDialog.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
function VoiceSetupDialog({ open, needsInstallation, onDismiss, onOpenDetails, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives.Modal,
    {
      open,
      title: t(needsInstallation ? "setupPrompt.title" : "setupPrompt.unavailableTitle"),
      closeLabel: t("cancel"),
      onClose: onDismiss,
      footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", onClick: onDismiss, children: t("setupPrompt.later") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", "data-modal-autofocus": true, onClick: onOpenDetails, children: t(needsInstallation ? "setupPrompt.open" : "setupPrompt.details") })
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t(needsInstallation ? "setupPrompt.body" : "setupPrompt.unavailableBody") })
    }
  );
}

// src/client/VoiceInput.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime3 = require("react/jsx-runtime");
async function disposeRecording(capture) {
  try {
    await capture.dispose();
  } catch (_error) {
  }
}
function VoiceInput({
  sessionId,
  inputActions,
  locked,
  onActiveChange,
  createRecording,
  transcribe,
  openSettings,
  useSpeechReadiness,
  t
}) {
  const readiness = useSpeechReadiness((value) => value), catalog = readiness.catalog;
  const provider = catalog?.providers.find((item) => item.id === catalog.selection.providerId);
  const usable = readiness.connected && (provider?.preparation.phase === "ready" || provider?.preparation.phase === "standby" || provider?.preparation.phase === "waking");
  const [phase, setPhase] = (0, import_react2.useState)("idle"), [message, setMessage] = (0, import_react2.useState)(""), [pending, setPending] = (0, import_react2.useState)("");
  const [setupOpen, setSetupOpen] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
    if (usable) setSetupOpen(false);
  }, [usable]);
  const current = (0, import_react2.useRef)(), generation = (0, import_react2.useRef)(0);
  const expanded = phase !== "idle";
  (0, import_react2.useLayoutEffect)(() => {
    onActiveChange(expanded);
    return () => {
      onActiveChange(false);
    };
  }, [expanded, onActiveChange]);
  const cancel = () => {
    generation.current++;
    const active = current.current;
    current.current = void 0;
    if (active) {
      clearTimeout(active.timer);
      clearInterval(active.silenceTimer);
      active.abort.abort();
      void disposeRecording(active.capture);
    }
    setPending("");
    setMessage("");
    setPhase("idle");
    setSetupOpen(false);
  };
  (0, import_react2.useEffect)(() => {
    setPending("");
    setMessage("");
    setPhase("idle");
    setSetupOpen(false);
    const blur = () => {
      if (current.current?.phase === "recording") cancel();
    };
    const visibility = () => {
      if (document.hidden && current.current && current.current.phase !== "transcribing") cancel();
    };
    const escape = (event) => {
      if (event.key === "Escape" && current.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", escape);
      generation.current++;
      const active = current.current;
      current.current = void 0;
      if (active) {
        clearTimeout(active.timer);
        clearInterval(active.silenceTimer);
        active.abort.abort();
        void disposeRecording(active.capture);
      }
    };
  }, [sessionId]);
  const feedback = (text) => {
    setMessage(text);
    setPhase("feedback");
  };
  const failureText = (failure) => failure instanceof RecordingError ? t(failure.kind) : t("failed", { message: failure instanceof Error ? failure.message : String(failure) });
  const finish = async () => {
    const active = current.current;
    if (!active || active.phase !== "recording") return;
    active.phase = "transcribing";
    const run = generation.current;
    clearTimeout(active.timer);
    clearInterval(active.silenceTimer);
    setPhase("transcribing");
    try {
      const audio = await active.capture.stop(active.maxDurationSeconds);
      if (run !== generation.current) return;
      if (audio.byteLength > active.maxAudioBytes) {
        feedback(t("tooLarge"));
        return;
      }
      const result = await transcribe({ audioBase64: audioBase64(audio), ...active.selection }, active.abort.signal);
      if (run !== generation.current) return;
      if (!result.ok) {
        feedback(t("failed", { message: result.error.message }));
        return;
      }
      if (result.value.text.trim() === "") {
        feedback(t("empty"));
        return;
      }
      if (!inputActions.insertText(result.value.text, active.span)) {
        setPending(result.value.text);
        feedback(t("conflict"));
        return;
      }
      setPhase("idle");
      if (active.autoSend) inputActions.submit();
    } catch (failure) {
      await disposeRecording(active.capture);
      if (run === generation.current) feedback(failureText(failure));
    } finally {
      if (run === generation.current) current.current = void 0;
    }
  };
  const start = async () => {
    if (!catalog || !usable || locked || current.current) return;
    const run = ++generation.current;
    const active = {
      capture: createRecording(),
      abort: new AbortController(),
      span: inputActions.captureInsertion(),
      selection: catalog.selection,
      autoSend: catalog.inputPreferences.autoSend,
      maxDurationSeconds: catalog.maxDurationSeconds,
      maxAudioBytes: catalog.maxAudioBytes,
      phase: "requesting"
    };
    current.current = active;
    setMessage("");
    setPending("");
    setPhase("requesting");
    try {
      await active.capture.start((failure) => {
        if (run !== generation.current || current.current !== active || active.phase === "transcribing") return;
        current.current = void 0;
        clearTimeout(active.timer);
        clearInterval(active.silenceTimer);
        active.abort.abort();
        feedback(failureText(failure));
      });
      if (run !== generation.current || current.current !== active) return;
      active.phase = "recording";
      setPhase("recording");
      active.timer = setTimeout(() => {
        void finish();
      }, active.maxDurationSeconds * 1e3);
      if (!catalog.inputPreferences.silenceDetection) return;
      let heardSpeech = false, silenceSince;
      active.silenceTimer = setInterval(() => {
        if (current.current !== active || active.phase !== "recording") return;
        const now = performance.now();
        if (active.capture.amplitude() >= catalog.inputPreferences.silenceThreshold) {
          heardSpeech = true;
          silenceSince = void 0;
        } else if (heardSpeech) {
          silenceSince ??= now;
          if (now - silenceSince >= catalog.inputPreferences.silenceDurationMs) void finish();
        }
      }, 50);
    } catch (failure) {
      await disposeRecording(active.capture);
      if (run === generation.current) {
        current.current = void 0;
        feedback(failureText(failure));
      }
    }
  };
  if (!expanded) return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("dictate"), disabled: !usable, side: "top", portal: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: VoiceInput_default.triggerAnchor, "data-speech-enhancement-input": true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        className: VoiceInput_default.trigger,
        size: "sm",
        disabled: locked,
        "aria-label": t(usable ? "start" : "setupPrompt.trigger"),
        "aria-haspopup": usable ? void 0 : "dialog",
        onMouseDown: (event) => {
          event.preventDefault();
        },
        onClick: () => {
          if (usable) void start();
          else setSetupOpen(true);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconMicrophoneOutlineRegular, { size: 18 })
      }
    ) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      VoiceSetupDialog,
      {
        open: setupOpen && !usable,
        needsInstallation: readiness.connected && provider?.location === "host-local" && provider.preparation.phase === "unprepared",
        onDismiss: () => {
          setSetupOpen(false);
        },
        onOpenDetails: () => {
          setSetupOpen(false);
          openSettings();
        },
        t
      }
    )
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: VoiceInput_default.captureRow, "data-voice-activity": phase, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        type: "button",
        className: VoiceInput_default.roundButton,
        size: "sm",
        "aria-label": t(pending ? "discard" : "cancel"),
        onClick: cancel,
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconCloseOutlineRegular, { size: 14 })
      }
    ),
    phase === "recording" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Waveform, { recording: current.current?.capture, label: t("recording") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: VoiceInput_default.activityMessage, role: "status", title: pending || message, children: [
      (phase === "requesting" || phase === "transcribing") && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing" }),
      phase === "feedback" ? message : t(phase === "requesting" ? "requesting" : provider?.preparation.phase === "waking" ? "wakingShort" : "transcribingShort")
    ] }),
    phase === "recording" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        type: "button",
        className: VoiceInput_default.roundButton,
        size: "sm",
        "aria-label": t("stop"),
        onClick: () => {
          void finish();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconStopFillRegular, { size: 14 })
      }
    ),
    phase === "feedback" && (pending ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { className: VoiceInput_default.inlineAction, size: "sm", type: "button", onClick: () => {
      if (inputActions.insertText(pending, inputActions.captureInsertion())) {
        setPending("");
        setPhase("idle");
      }
    }, children: t("insert") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        className: VoiceInput_default.roundButton,
        size: "sm",
        type: "button",
        "aria-label": t("retryRecording"),
        disabled: !usable || locked,
        onClick: () => {
          void start();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconMicrophoneOutlineRegular, { size: 18 })
      }
    ))
  ] });
}

// src/client/readiness.ts
function observeReadiness(ctx, form) {
  let catalog = null, connected = false, disposed = false, error = null;
  let snapshot2 = { catalog: null, connected: false, error: null };
  const listeners = /* @__PURE__ */ new Set();
  const update = () => {
    const config = form.getSnapshot();
    snapshot2 = { catalog: catalog && config.status === "ready" && config.value ? { ...catalog, inputPreferences: config.value } : null, connected, error };
    for (const listener of listeners) listener();
  };
  const unsubscribe = form.subscribe(update);
  const stream = ctx.remote.$stream({
    name: "Speech service enhancements",
    open: (signal) => ctx.remote.speech.follow(signal),
    ended: () => new Error("Speech service disconnected"),
    carrierFailed: (failure) => {
      connected = false;
      error = String(failure);
      update();
    }
  });
  const observing = (async () => {
    try {
      for await (const item of stream) {
        if (disposed) break;
        catalog = item.value;
        connected = true;
        error = null;
        update();
        item.accept();
      }
    } catch (failure) {
      if (!disposed) {
        connected = false;
        error = String(failure);
        update();
      }
    }
  })();
  return {
    state: { getSnapshot: () => snapshot2, subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    } },
    dispose: async () => {
      disposed = true;
      unsubscribe();
      listeners.clear();
      await stream.dispose();
      await observing;
    }
  };
}

// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = /* @__PURE__ */ Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name, keys, format) {
  formatters[name] = format;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/settings.mjs
var ModelSchema = Schema.object({
  id: Schema.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).required(),
  name: Schema.string().min(1).required(),
  engine: Schema.union(["funasr", "faster-whisper"]).default("funasr"),
  modelPath: Schema.string().pattern(/^(?:[A-Za-z]:[\\/]|\/|\\\\)/).required(),
  pythonExecutable: Schema.string().min(1).default("python"),
  device: Schema.string().min(1).default("cpu"),
  computeType: Schema.string().min(1).default("int8"),
  languages: Schema.array(Schema.string().pattern(/^(?:auto|[a-z]{2,3}(?:-[a-zA-Z]+)?)$/)).min(1).default(["auto", "zh", "en"]),
  enabled: Schema.boolean().default(true)
});
var ModelsSchema = Schema.transform(Schema.array(ModelSchema).max(32).default([]), (models) => {
  if (new Set(models.map((model) => model.id)).size !== models.length) throw new TypeError("ASR model ids must be unique");
  return models;
}).default([]);
var SettingsSchema = Schema.object({
  enhancedInput: Schema.boolean().default(true),
  silenceDetection: Schema.boolean().default(true),
  autoSend: Schema.boolean().default(true),
  autoRead: Schema.boolean().default(false),
  silenceThreshold: Schema.number().min(1e-3).max(1).default(0.01),
  silenceDurationMs: Schema.number().step(1).min(200).max(1e4).default(1e3),
  models: ModelsSchema,
  workerTimeoutMs: Schema.number().step(1).min(1e3).max(36e5).default(3e5),
  workerGraceMs: Schema.number().step(1).min(1).max(1e4).default(1e3),
  maxWorkerOutputBytes: Schema.number().step(1).min(1024).max(1048576).default(131072),
  maxConcurrentRecognitions: Schema.number().step(1).min(1).max(8).default(1)
});
var Config = SettingsSchema.volatile().default({});

// src/client/preferences.ts
function preferencesForm(form, mirror) {
  let previousForm, previousMirror, snapshot2;
  return {
    getSnapshot() {
      const base = form.getSnapshot(), document2 = mirror.getSnapshot();
      if (base === previousForm && document2 === previousMirror) return snapshot2;
      previousForm = base;
      previousMirror = document2;
      snapshot2 = { ...base };
      const section = document2.view?.namespaces.find((entry) => entry.ns === "dsh-speech-service");
      if (base.mode !== "memory" && section?.value !== void 0) {
        try {
          snapshot2.value = SettingsSchema(section.value);
          snapshot2.status = "ready";
        } catch (_invalidSettings) {
          snapshot2.value = void 0;
          snapshot2.status = "unavailable";
        }
      }
      return snapshot2;
    },
    subscribe(listener) {
      const a = form.subscribe(listener), b = mirror.subscribe(listener);
      return () => {
        a();
        b();
      };
    },
    mutate: (ops, revision) => form.mutate(ops, revision),
    set: (field, value) => form.set(field, value),
    unset: (field) => form.unset(field)
  };
}

// src/client/Settings.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/Models.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime4 = require("react/jsx-runtime");
function Models({ models, writable, save, t }) {
  const [draft, setDraft] = (0, import_react3.useState)(), [error, setError] = (0, import_react3.useState)("");
  const [languages, setLanguages] = (0, import_react3.useState)("auto,zh,en");
  const edit = (model) => {
    setDraft({ ...model });
    setLanguages(model.languages.join(","));
    setError("");
  };
  const add = () => edit({ ...ModelSchema({ id: crypto.randomUUID(), name: "draft", modelPath: "/draft" }), name: "", modelPath: "" });
  const submit = async () => {
    if (!draft) return;
    try {
      const model = ModelSchema({ ...draft, name: draft.name.trim(), modelPath: draft.modelPath.trim(), languages: languages.split(",").map((value) => value.trim()).filter(Boolean) });
      const next = models.some((row) => row.id === model.id) ? models.map((row) => row.id === model.id ? model : row) : [...models, model];
      if (await save(next)) {
        setDraft(void 0);
        setError("");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { "data-asr-models": true, className: VoiceInput_default.models, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h4", { children: t("modelsTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("modelsHelp") }),
    models.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("modelsEmpty") }),
    models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: VoiceInput_default.modelRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: model.name }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: model.engine }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: model.modelPath }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "checkbox",
            checked: model.enabled,
            disabled: !writable,
            onChange: (event) => {
              void save(models.map((row) => row.id === model.id ? { ...row, enabled: event.target.checked } : row));
            }
          }
        ),
        t("modelEnabled")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", disabled: !writable, onClick: () => edit(model), children: t("editModel") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", disabled: !writable, onClick: () => {
        void save(models.filter((row) => row.id !== model.id));
      }, children: t("removeModel") })
    ] }, model.id)),
    !draft && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", disabled: !writable || models.length >= 32, onClick: add, children: t("addModel") }),
    draft && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: VoiceInput_default.modelEditor, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        t("modelName"),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Input, { "aria-label": t("modelName"), value: draft.name, disabled: !writable, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        t("modelEngine"),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "select",
          {
            "aria-label": t("modelEngine"),
            value: draft.engine,
            disabled: !writable,
            onChange: (event) => setDraft({ ...draft, engine: event.target.value === "funasr" ? "funasr" : "faster-whisper" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "funasr", children: "FunASR" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "faster-whisper", children: "faster-whisper" })
            ]
          }
        )
      ] }),
      ["modelPath", "pythonExecutable", "device", "computeType"].map((field) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        t(field),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives3.Input,
          {
            "aria-label": t(field),
            value: draft[field],
            disabled: !writable,
            onChange: (event) => setDraft({ ...draft, [field]: event.target.value })
          }
        )
      ] }, field)),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        t("modelLanguages"),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Input, { "aria-label": t("modelLanguages"), value: languages, disabled: !writable, onChange: (event) => setLanguages(event.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("computeHelp") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: !writable, onClick: () => {
        void submit();
      }, children: t("saveModel") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", disabled: !writable, onClick: () => {
        setDraft(void 0);
        setError("");
      }, children: t("cancel") }),
      error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", children: error })
    ] })
  ] });
}

// src/client/Settings.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function Settings({ form, openRecognition, configure, useSpeechReadiness, t }) {
  const readiness = useSpeechReadiness((value2) => value2), catalog = readiness.catalog;
  const snapshot2 = (0, import_react4.useSyncExternalStore)(form.subscribe, form.getSnapshot);
  const [busy, setBusy] = (0, import_react4.useState)(false), [error, setError] = (0, import_react4.useState)("");
  const [pending, setPending] = (0, import_react4.useState)({});
  const value = snapshot2.value;
  const writable = snapshot2.status === "ready" && snapshot2.writable && !!value && !busy;
  const save = async (field, next) => {
    setBusy(true);
    setError("");
    setPending({ [field]: next });
    try {
      if (!await form.set(field, next)) {
        setError(t("saveRefused"));
        return false;
      }
      ;
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
      setPending({});
    }
  };
  const select = async (id) => {
    const provider = catalog?.providers.find((row) => row.id === id);
    if (!provider || !catalog) return;
    setBusy(true);
    setError("");
    try {
      await configure({ providerId: provider.id, language: provider.languages.includes(catalog.selection.language) ? catalog.selection.language : provider.languages[0] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: VoiceInput_default.preferences, "data-speech-enhancement-settings": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("enhancementHelp") }),
    ["enhancedInput", "silenceDetection", "autoSend", "autoRead"].map((field) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: pending[field] ?? value?.[field] ?? false, disabled: !writable, onChange: (event) => {
        void save(field, event.target.checked);
      } }),
      t(field)
    ] }, field)),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
      t("silenceThreshold"),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives4.Input,
        {
          type: "number",
          "aria-label": t("silenceThreshold"),
          min: 1e-3,
          max: 1,
          step: 1e-3,
          defaultValue: value?.silenceThreshold,
          disabled: !writable,
          onBlur: (event) => {
            const next = Number(event.target.value);
            if (next !== value?.silenceThreshold) void save("silenceThreshold", next);
          }
        },
        `threshold:${value?.silenceThreshold}`
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
      t("silenceDuration"),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives4.Input,
        {
          type: "number",
          "aria-label": t("silenceDuration"),
          min: 200,
          max: 1e4,
          step: 100,
          defaultValue: value?.silenceDurationMs,
          disabled: !writable,
          onBlur: (event) => {
            const next = Number(event.target.value);
            if (next !== value?.silenceDurationMs) void save("silenceDurationMs", next);
          }
        },
        `duration:${value?.silenceDurationMs}`
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("autoReadHelp") }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Models, { models: pending.models ?? value?.models ?? [], writable, save: (models) => save("models", models), t }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
      t("provider"),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "select",
        {
          "aria-label": t("provider"),
          disabled: busy || !readiness.connected || !catalog,
          value: catalog?.providers.some((row) => row.id === catalog.selection.providerId) ? catalog.selection.providerId : "",
          onChange: (event) => {
            void select(event.target.value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", disabled: true, children: t("chooseProvider") }),
            catalog?.providers.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: provider.id, children: provider.name }, provider.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", onClick: openRecognition, children: t("recognitionSettings") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: error })
  ] });
}

// src/client/auto-read.js
var React2 = __toESM(require("react"), 1);

// src/client/reply-player.js
var React = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var rabiSpeechLocales = {
  zh: { play: "\u6717\u8BFB\u56DE\u590D", busy: "\u751F\u6210\u4E2D", pause: "\u6682\u505C", resume: "\u64AD\u653E", seek: "\u64AD\u653E\u8FDB\u5EA6", failed: "\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", offline: "Rabi TTS \u670D\u52A1\u672A\u5F00\u542F", "no-default": "Rabi \u672A\u914D\u7F6E\u9ED8\u8BA4 TTS", "bad-request": "\u56DE\u590D\u4E3A\u7A7A\u6216\u8D85\u8FC7 10000 \u5B57\u7B26", unreachable: "\u65E0\u6CD5\u8FDE\u63A5 Rabi", rejected: "Rabi \u62D2\u7EDD\u4E86\u751F\u6210\u8BF7\u6C42", playback: "\u65E0\u6CD5\u64AD\u653E\u97F3\u9891\uFF0C\u8BF7\u91CD\u8BD5\u64AD\u653E", upgrade: "\u8BF7\u91CD\u542F DSH \u4EE5\u52A0\u8F7D\u65B0\u7248\u8BED\u97F3\u670D\u52A1" },
  en: { play: "Read reply aloud", busy: "Generating", pause: "Pause", resume: "Play", seek: "Playback position", failed: "Generation failed. Retry.", offline: "Rabi TTS is offline", "no-default": "No default TTS configured in Rabi", "bad-request": "Reply is empty or exceeds 10000 characters", unreachable: "Cannot connect to Rabi", rejected: "Rabi rejected synthesis", playback: "Unable to play audio. Try playing again.", upgrade: "Restart DSH to load the updated speech service" }
};
function rabiReplyText(snapshot2, messageId) {
  const node = snapshot2.eventNodes.find((node2) => node2.kind === "assistant" && node2.messageId === messageId);
  return node?.blocks.filter((block) => block.kind === "text").map((block) => block.text).join("\n\n") || "";
}
function speechTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function RabiSpeechAction({ sessionId, messageId, useTrajectory, t, autoPlay = false, onFinished }) {
  const text = useTrajectory((snapshot2) => rabiReplyText(snapshot2, messageId));
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [ready, setReady] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const pending = React.useRef(null);
  const media = React.useRef(null);
  const releaseAudio = () => {
    const current = media.current;
    if (!current) return;
    media.current = null;
    current.audio.onloadedmetadata = current.audio.ondurationchange = current.audio.ontimeupdate = current.audio.onplay = current.audio.onpause = current.audio.onended = current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute("src");
    current.audio.load();
    URL.revokeObjectURL(current.url);
  };
  React.useEffect(() => {
    setBusy(false);
    setNotice(null);
    setReady(false);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    return () => {
      pending.current?.abort();
      pending.current = null;
      releaseAudio();
    };
  }, [sessionId, messageId]);
  const startAudio = async (current) => {
    try {
      await current.audio.play();
    } catch {
      if (media.current === current) {
        setPlaying(false);
        setNotice(t("playback"));
      }
    }
  };
  const play = async () => {
    if (pending.current) return;
    if (media.current) {
      setNotice(null);
      if (!media.current.audio.paused) media.current.audio.pause();
      else await startAudio(media.current);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/rabiroute/speech", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ text, sessionId }) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav")) {
        const result = await response.json();
        throw new Error(result.ok ? t("upgrade") : `${t(result.reason in rabiSpeechLocales.en ? result.reason : "failed")}${result.message ? `: ${result.message}` : ""}`);
      }
      const blob = await response.blob();
      if (pending.current !== controller) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const current = { audio, url };
      media.current = current;
      const update = () => {
        if (media.current !== current) return;
        setPosition(audio.currentTime);
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        setPlaying(!audio.paused && !audio.ended);
      };
      audio.onloadedmetadata = audio.ondurationchange = audio.ontimeupdate = audio.onplay = audio.onpause = update;
      audio.onended = () => {
        update();
        onFinished?.();
      };
      audio.onerror = () => {
        if (media.current !== current) return;
        releaseAudio();
        setReady(false);
        setPlaying(false);
        setNotice(t("playback"));
      };
      setReady(true);
      await startAudio(current);
    } catch (error) {
      if (pending.current === controller) setNotice(error instanceof Error ? error.message : t("failed"));
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  React.useEffect(() => {
    if (autoPlay) void play();
  }, [autoPlay]);
  if (!text.trim()) return null;
  const label = busy ? "busy" : ready ? playing ? "pause" : "resume" : "play";
  const path = ready ? playing ? "M8 5v14 M16 5v14" : "m8 5 11 7-11 7V5Z" : "M11 5 6 9H3v6h3l5 4V5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14";
  return React.createElement(
    "span",
    { "data-rabi-speech": true, style: { display: "inline-flex", alignItems: "center", gap: 4, height: 24, verticalAlign: "middle", fontSize: 11 } },
    React.createElement(
      import_dsh_client_ui_primitives5.Button,
      { size: "sm", variant: "ghost", disabled: busy, title: t(label), "aria-label": t(label), "aria-busy": busy, onClick: play, style: { height: 24, width: 24, minHeight: 24, padding: 3 } },
      React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, React.createElement("path", { d: path }))
    ),
    busy && React.createElement("span", { role: "status", style: { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" } }, t("busy"), React.createElement("progress", { "aria-label": t("busy"), style: { width: 44, height: 4 } })),
    ready && !busy && React.createElement("input", { type: "range", min: 0, max: duration || 1, step: 0.1, value: position, disabled: !duration, "aria-label": t("seek"), "aria-valuetext": `${speechTime(position)} / ${speechTime(duration)}`, style: { width: 84, height: 16, margin: 0, accentColor: "currentColor", cursor: "pointer" }, onChange: (event) => {
      if (!media.current || !duration) return;
      const next = Math.min(duration, Math.max(0, Number(event.target.value)));
      media.current.audio.currentTime = next;
      setPosition(next);
    } }),
    ready && !busy && React.createElement("span", { style: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, `${speechTime(position)}/${speechTime(duration)}`),
    notice && React.createElement("span", { role: "alert", title: notice, "aria-label": notice, style: { cursor: "help" } }, "\u26A0")
  );
}

// src/client/auto-read.js
function createRabiReplyGate() {
  let primed = false, lastSeq = -1;
  return {
    reset: () => {
      primed = false;
      lastSeq = -1;
    },
    take(snapshot2, ready, enabled) {
      if (!ready) {
        primed = false;
        return [];
      }
      const nodes = snapshot2.eventNodes;
      const newest = nodes.reduce((seq, node) => Math.max(seq, node.seq), lastSeq);
      if (!primed) {
        primed = true;
        lastSeq = newest;
        return [];
      }
      const replies = enabled ? nodes.filter((node) => node.seq > lastSeq && node.kind === "assistant" && node.messageId && !node.interrupted && !node.blocks.some((block) => block.kind === "tool-call") && node.blocks.some((block) => block.kind === "text" && block.text.trim())) : [];
      lastSeq = newest;
      return replies.sort((left, right) => left.seq - right.seq).map((node) => node.messageId);
    }
  };
}
function RabiAutoSpeech({ sessionId, useTrajectory, useSession, useRabiAutoRead, t }) {
  const snapshot2 = useTrajectory((value) => value);
  const ready = useSession((value) => value.openState === "open");
  const enabled = useRabiAutoRead((value) => value);
  const gate = React2.useRef(null);
  if (!gate.current) gate.current = createRabiReplyGate();
  const [queue, setQueue] = React2.useState([]);
  const [visible, setVisible] = React2.useState(!document.hidden);
  React2.useEffect(() => {
    const replies = gate.current.take(snapshot2, ready && visible, enabled);
    if (!ready || !enabled || !visible) setQueue((current) => current.length ? [] : current);
    else if (replies.length) setQueue((current) => [...current, ...replies]);
  }, [snapshot2, ready, enabled, visible]);
  React2.useEffect(() => {
    const hide = () => {
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  const messageId = queue[0];
  if (!enabled || !ready || !visible || !messageId) return null;
  return React2.createElement(RabiSpeechAction, {
    key: `${sessionId}:${messageId}`,
    sessionId,
    messageId,
    useTrajectory,
    t,
    autoPlay: true,
    onFinished: () => setQueue((current) => current.filter((id) => id !== messageId))
  });
}

// src/client/locales.ts
var NS = "speech-service-enhancement";
var zh = {
  modelsTitle: "\u81EA\u5B9A\u4E49 ASR \u6A21\u578B",
  chooseProvider: "\u8BF7\u9009\u62E9\u8BC6\u522B\u670D\u52A1",
  modelsHelp: "\u6DFB\u52A0\u8FD0\u884C DSH \u7684\u7535\u8111\u4E0A\u7684\u672C\u5730\u6A21\u578B\u3002\u4FDD\u5B58\u540E\u53EF\u5728\u4E0B\u65B9\u300C\u8BC6\u522B\u670D\u52A1\u300D\u4E2D\u5207\u6362\uFF1BPython \u73AF\u5883\u9700\u5DF2\u5B89\u88C5\u6240\u9009\u540E\u7AEF\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u4E0B\u8F7D\u6A21\u578B\u3002",
  modelsEmpty: "\u672A\u6DFB\u52A0\u81EA\u5B9A\u4E49\u6A21\u578B\uFF0C\u7EE7\u7EED\u4F7F\u7528\u5B98\u65B9\u8BC6\u522B\u5668\u3002",
  addModel: "\u6DFB\u52A0 ASR \u6A21\u578B",
  editModel: "\u7F16\u8F91\u6A21\u578B",
  removeModel: "\u79FB\u9664\u6A21\u578B",
  saveModel: "\u4FDD\u5B58\u6A21\u578B",
  modelName: "\u6A21\u578B\u540D\u79F0",
  modelEngine: "ASR \u540E\u7AEF",
  modelPath: "\u6A21\u578B\u7EDD\u5BF9\u8DEF\u5F84",
  pythonExecutable: "Python \u53EF\u6267\u884C\u6587\u4EF6",
  device: "\u8BA1\u7B97\u8BBE\u5907",
  computeType: "\u8BA1\u7B97\u7CBE\u5EA6",
  modelLanguages: "\u652F\u6301\u7684\u8BED\u8A00\uFF08\u9017\u53F7\u5206\u9694\uFF09",
  modelEnabled: "\u542F\u7528\u6A21\u578B",
  computeHelp: "\u8BBE\u5907\u793A\u4F8B\uFF1Acpu\u3001cuda\u3002\u8BA1\u7B97\u7CBE\u5EA6\u53EA\u7528\u4E8E faster-whisper\uFF08\u5982 int8\u3001float16\uFF09\u3002\u6BCF\u6B21\u8BC6\u522B\u6309\u9700\u52A0\u8F7D\u6A21\u578B\uFF0C\u7ED3\u675F\u540E\u91CA\u653E\uFF1B\u5927\u6A21\u578B\u52A0\u8F7D\u53EF\u80FD\u8F83\u6162\u3002",
  saveRefused: "\u8BBE\u7F6E\u672A\u4FDD\u5B58\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  enhancedInput: "\u589E\u5F3A\u8F93\u5165\u6846\u8BED\u97F3",
  silenceDetection: "\u9759\u97F3\u540E\u81EA\u52A8\u7ED3\u675F\u5F55\u97F3",
  silenceDuration: "\u9759\u97F3\u6536\u5C3E\uFF08\u6BEB\u79D2\uFF09",
  enhancementHelp: "\u5728\u5B98\u65B9\u8BED\u97F3\u8F93\u5165\u4E0A\u589E\u52A0\u53EF\u72EC\u7ACB\u505C\u7528\u7684\u589E\u5F3A\u3002\u5173\u95ED\u589E\u5F3A\u8F93\u5165\u6846\u8BED\u97F3\u540E\u6062\u590D\u5B98\u65B9\u8F93\u5165\u65B9\u5F0F\u3002",
  recognitionSettings: "\u8BC6\u522B\u6A21\u578B\u4E0E\u8BED\u8A00\u8BBE\u7F6E",
  autoSend: "\u8F6C\u5199\u540E\u81EA\u52A8\u53D1\u9001",
  autoSendHelp: "\u5F00\u542F\u540E\u53D1\u9001\u8F93\u5165\u6846\u4E2D\u7684\u5185\u5BB9\uFF1B\u5173\u95ED\u540E\u4EC5\u586B\u5165\u6587\u5B57\uFF0C\u4F9B\u4F60\u4FEE\u6539\u3002",
  autoRead: "\u81EA\u52A8\u6717\u8BFB\u56DE\u590D",
  autoReadHelp: "\u901A\u8FC7\u5DF2\u542F\u7528\u7684\u6717\u8BFB\u63D2\u4EF6\u64AD\u653E\u65B0\u56DE\u590D\u6B63\u6587\uFF0C\u9700\u8981\u53EF\u7528\u7684\u8BED\u97F3\u5408\u6210\u670D\u52A1\u3002\u5386\u53F2\u56DE\u590D\u4E0D\u4F1A\u81EA\u52A8\u6717\u8BFB\u3002",
  silenceThreshold: "\u58F0\u97F3\u9608\u503C\uFF08RMS\uFF09",
  silenceDurationMs: "\u9759\u97F3\u6536\u5C3E\uFF08\u6BEB\u79D2\uFF09",
  silenceHelp: "\u5F00\u59CB\u8BF4\u8BDD\u540E\uFF0C\u58F0\u97F3\u6301\u7EED\u4F4E\u4E8E\u9608\u503C\u8FBE\u5230\u8BBE\u5B9A\u65F6\u957F\uFF0C\u5C31\u81EA\u52A8\u7ED3\u675F\u5F55\u97F3\u5E76\u8F6C\u5199\u3002\u9ED8\u8BA4 1 \u79D2\u3002",
  dictate: "\u542C\u5199",
  "setupPrompt.title": "\u4F7F\u7528\u8BED\u97F3\u670D\u52A1\u524D\u9700\u8981\u5B89\u88C5",
  "setupPrompt.body": "\u8BED\u97F3\u670D\u52A1\u63D2\u4EF6\u5DF2\u5F00\u542F\u3002\u9996\u6B21\u5F55\u97F3\u9700\u8981\u5728\u672C\u673A\u4E0B\u8F7D\u5E76\u51C6\u5907\u8BC6\u522B\u6A21\u578B\uFF0C\u8BF7\u524D\u5F80\u63D2\u4EF6\u8BE6\u60C5\u9875\u67E5\u770B\u7A7A\u95F4\u3001\u5185\u5B58\u548C\u65F6\u95F4\u8BF4\u660E\uFF0C\u518D\u5F00\u59CB\u5B89\u88C5\u3002",
  "setupPrompt.later": "\u7A0D\u540E",
  "setupPrompt.open": "\u524D\u5F80\u5B89\u88C5",
  "setupPrompt.trigger": "\u6253\u5F00\u8BED\u97F3\u670D\u52A1\u5F15\u5BFC",
  "setupPrompt.details": "\u524D\u5F80\u8BED\u97F3\u63D2\u4EF6\u8BBE\u7F6E",
  "setupPrompt.unavailableTitle": "\u8BED\u97F3\u8BC6\u522B\u5C1A\u672A\u5C31\u7EEA",
  "setupPrompt.unavailableBody": "\u8BF7\u524D\u5F80\u8BED\u97F3\u63D2\u4EF6\u8BE6\u60C5\u9875\u67E5\u770B\u8BC6\u522B\u670D\u52A1\u72B6\u6001\u3001\u51C6\u5907\u8FDB\u5EA6\u6216\u9519\u8BEF\u4FE1\u606F",
  "setup.local": "\u5C06\u5728\u8FD0\u884C DSH \u7684\u673A\u5668\u4E0A\u4E0B\u8F7D\u672C\u5730\u6A21\u578B\uFF0C\u65E0\u9700\u5B89\u88C5 Python \u6216\u7F16\u8BD1\u5DE5\u5177\u3002",
  "setup.disk": "\u786C\u76D8\u7A7A\u95F4",
  "setup.diskValue": "\u5EFA\u8BAE\u9884\u7559\u7EA6 {gb} GB\uFF0C\u5305\u542B\u6A21\u578B\u3001\u8FD0\u884C\u65F6\u548C\u4E0B\u8F7D\u7F13\u5B58",
  "setup.memory": "\u8FD0\u884C\u5185\u5B58",
  "setup.memoryValue": "\u6A21\u578B\u52A0\u8F7D\u540E\u7EA6 {gb} GB\uFF0C\u8BC6\u522B\u65F6\u53EF\u80FD\u66F4\u9AD8",
  "setup.time": "\u9996\u6B21\u51C6\u5907",
  "setup.timeValue": "\u53C2\u8003 {min}\u2013{max} \u5206\u949F\uFF0C\u53D6\u51B3\u4E8E\u7F51\u7EDC\u548C\u673A\u5668\u6027\u80FD",
  "setup.estimateNote": "\u4EE5\u4E0A\u4E3A\u4F30\u7B97\uFF1B\u7F51\u7EDC\u8F83\u6162\u65F6\u53EF\u80FD\u66F4\u4E45\u3002\u5DF2\u4E0B\u8F7D\u7684\u8D44\u6E90\u4F1A\u590D\u7528\uFF0C\u9ED8\u8BA4\u5728\u95F2\u7F6E\u540E\u91CA\u653E\u6A21\u578B\u5185\u5B58\u3002",
  "step.check": "\u68C0\u67E5\u672C\u5730\u8D44\u6E90",
  "step.model": "\u51C6\u5907\u8BED\u97F3\u8BC6\u522B\u6A21\u578B",
  "step.vad": "\u51C6\u5907\u8BED\u97F3\u68C0\u6D4B\u6A21\u578B",
  "step.verify": "\u6821\u9A8C\u6A21\u578B\u6587\u4EF6",
  "step.load": "\u52A0\u8F7D {name}",
  "stepStatus.pending": "\u672A\u5F00\u59CB",
  "stepStatus.running": "\u8FDB\u884C\u4E2D",
  "stepStatus.complete": "\u5DF2\u5B8C\u6210",
  "stepStatus.failed": "\u5931\u8D25",
  "stepStatus.cancelled": "\u5DF2\u53D6\u6D88",
  "short.downloading": "\u4E0B\u8F7D\u4E2D",
  "short.failed": "\u51C6\u5907\u5931\u8D25",
  retryRecording: "\u91CD\u65B0\u5F55\u97F3",
  preparationSteps: "\u51C6\u5907\u6B65\u9AA4",
  "prepare": "\u4E0B\u8F7D\u5E76\u51C6\u5907",
  "retryPrepare": "\u91CD\u8BD5\u51C6\u5907",
  "cancelPrepare": "\u53D6\u6D88\u51C6\u5907",
  "downloadProgress": "\u4E0B\u8F7D\u8FDB\u5EA6",
  "downloadBytes": "\u4E0B\u8F7D\uFF1A{completed} / {total} MB\uFF0C{percent}%",
  "downloadUnknown": "\u5DF2\u4E0B\u8F7D {completed} MB",
  "elapsed": "\u5DF2\u7B49\u5F85 {seconds} \u79D2",
  "preparationFailed": "\u51C6\u5907\u5931\u8D25\uFF1A{message}",
  "download.network": "\u65E0\u6CD5\u4E0B\u8F7D {resource}\uFF1A\u8FDE\u63A5\u4E0B\u8F7D\u670D\u52A1\u5931\u8D25\u3002",
  "download.dns": "\u65E0\u6CD5\u4E0B\u8F7D {resource}\uFF1A\u65E0\u6CD5\u89E3\u6790\u4E0B\u8F7D\u5730\u5740\u3002",
  "download.timeout": "\u4E0B\u8F7D {resource} \u8D85\u65F6\u3002",
  "download.certificate": "\u65E0\u6CD5\u4E0B\u8F7D {resource}\uFF1A\u5B89\u5168\u8FDE\u63A5\u7684\u8BC1\u4E66\u6821\u9A8C\u5931\u8D25\u3002",
  "download.http": "\u65E0\u6CD5\u4E0B\u8F7D {resource}\uFF1A\u4E0B\u8F7D\u670D\u52A1\u8FD4\u56DE HTTP {status}\u3002",
  "download.integrity": "{resource} \u4E0B\u8F7D\u4E0D\u5B8C\u6574\u6216\u6587\u4EF6\u6821\u9A8C\u5931\u8D25\u3002",
  "download.storage": "\u65E0\u6CD5\u4FDD\u5B58 {resource}\uFF1A\u78C1\u76D8\u7A7A\u95F4\u4E0D\u8DB3\u6216\u6CA1\u6709\u5199\u5165\u6743\u9650\u3002",
  "download.unknown": "\u51C6\u5907 {resource} \u5931\u8D25\u3002",
  "downloadAdvice.network": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u80FD\u5426\u8BBF\u95EE\u4E0B\u8F7D\u6765\u6E90\u53CA\u5176\u6A21\u578B\u4E0B\u8F7D\u670D\u52A1\uFF1B\u5982\u9700\u4EE3\u7406\uFF0C\u8BF7\u5728\u8BE5\u673A\u5668\u4E0A\u914D\u7F6E\u540E\u91CD\u8BD5\u3002",
  "downloadAdvice.dns": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u7684 DNS \u548C\u4EE3\u7406\u8BBE\u7F6E\uFF0C\u786E\u8BA4\u53EF\u4EE5\u89E3\u6790\u4E0B\u8F7D\u6765\u6E90\u7684\u57DF\u540D\u540E\u91CD\u8BD5\u3002",
  "downloadAdvice.timeout": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u7684\u7F51\u7EDC\u6216\u4EE3\u7406\u8FDE\u63A5\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002\u5DF2\u4E0B\u8F7D\u5E76\u901A\u8FC7\u6821\u9A8C\u7684\u6587\u4EF6\u4F1A\u4FDD\u7559\u3002",
  "downloadAdvice.certificate": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u7684\u7CFB\u7EDF\u65F6\u95F4\u3001\u53D7\u4FE1\u4EFB\u8BC1\u4E66\u548C\u4EE3\u7406\u8BBE\u7F6E\u540E\u91CD\u8BD5\u3002",
  "downloadAdvice.http": "\u8BF7\u786E\u8BA4\u4E0B\u8F7D\u5730\u5740\u53EF\u7528\u3001\u4EE3\u7406\u53EF\u6B63\u5E38\u8FDE\u63A5\u4E0B\u8F7D\u670D\u52A1\uFF0C\u6216\u7A0D\u540E\u91CD\u8BD5\u3002",
  "downloadAdvice.integrity": "\u8BF7\u91CD\u8BD5\u4E0B\u8F7D\u3002\u5DF2\u5B8C\u6210\u5E76\u901A\u8FC7\u6821\u9A8C\u7684\u5176\u4ED6\u6587\u4EF6\u4F1A\u4FDD\u7559\u3002",
  "downloadAdvice.storage": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u7684\u5269\u4F59\u78C1\u76D8\u7A7A\u95F4\uFF0C\u4EE5\u53CA\u6A21\u578B\u76EE\u5F55\u7684\u5199\u5165\u6743\u9650\u540E\u91CD\u8BD5\u3002",
  "downloadAdvice.unknown": "\u8BF7\u68C0\u67E5\u8FD0\u884C DSH \u7684\u673A\u5668\u7684\u7F51\u7EDC\u3001\u78C1\u76D8\u7A7A\u95F4\u548C\u6A21\u578B\u76EE\u5F55\u6743\u9650\u540E\u91CD\u8BD5\u3002",
  downloadSource: "\u4E0B\u8F7D\u6765\u6E90\uFF1A{source}",
  sourceChoice: "\u6A21\u578B\u4E0B\u8F7D\u6E90",
  sourceAuto: "\u81EA\u52A8\u9009\u62E9\uFF08\u63A8\u8350\uFF09",
  sourceHuggingFace: "Hugging Face",
  sourceMirror: "HF-Mirror\uFF08\u56FD\u5185\u955C\u50CF\uFF09",
  sourceAutoHelp: "\u4F18\u5148\u4F7F\u7528\u54CD\u5E94\u8F83\u5FEB\u7684\u6E90\uFF0C\u4E0B\u8F7D\u5931\u8D25\u65F6\u81EA\u52A8\u5C1D\u8BD5\u5176\u4ED6\u6E90\u3002",
  sourceManualHelp: "\u4EC5\u4ECE\u6240\u9009\u6E90\u4E0B\u8F7D\uFF1B\u5DF2\u4E0B\u8F7D\u5E76\u901A\u8FC7\u6821\u9A8C\u7684\u6587\u4EF6\u4F1A\u590D\u7528\u3002",
  downloadCode: "\u9519\u8BEF\u7801\uFF1A{code}",
  "reconnecting": "\u6B63\u5728\u8FDE\u63A5\u8BED\u97F3\u670D\u52A1\u2026",
  "preparation.unprepared": "\u9996\u6B21\u4F7F\u7528\u9700\u8981\u4E0B\u8F7D\u672C\u5730\u8BC6\u522B\u6A21\u578B\u3002",
  "preparation.checking": "\u6B63\u5728\u68C0\u67E5\u672C\u5730\u8D44\u6E90\u2026",
  "preparation.loading": "\u6B63\u5728\u52A0\u8F7D {name}\u2026",
  "preparation.waking": "\u6B63\u5728\u5524\u9192\u672C\u5730\u8BED\u97F3\u2026",
  "preparation.ready": "\u672C\u5730\u8BED\u97F3\u5DF2\u5C31\u7EEA\u3002",
  "preparation.standby": "\u672C\u5730\u8D44\u6E90\u5DF2\u51C6\u5907\uFF0C\u5F55\u97F3\u65F6\u81EA\u52A8\u5524\u9192\u3002",
  "preparation.cancelled": "\u51C6\u5907\u5DF2\u53D6\u6D88\uFF0C\u5DF2\u5B8C\u6210\u7684\u4E0B\u8F7D\u4F1A\u4FDD\u7559\u3002",
  "preparation.cancelling": "\u6B63\u5728\u53D6\u6D88\u51C6\u5907\u2026",
  cloudReady: "\u4E91\u7AEF\u8BED\u97F3\u8BC6\u522B\u5DF2\u5C31\u7EEA\u3002",
  discard: "\u4E22\u5F03\u8BC6\u522B\u6587\u5B57",
  transcribingShort: "\u8BC6\u522B\u4E2D\u2026",
  wakingShort: "\u5524\u9192\u4E2D\u2026",
  provider: "\u8BC6\u522B\u670D\u52A1",
  language: "\u8BC6\u522B\u8BED\u8A00",
  auto: "\u81EA\u52A8\u8BC6\u522B",
  zh: "\u4E2D\u6587",
  en: "\u82F1\u8BED",
  yue: "\u7CA4\u8BED",
  ja: "\u65E5\u8BED",
  ko: "\u97E9\u8BED",
  start: "\u5F00\u59CB\u5F55\u97F3",
  stop: "\u505C\u6B62\u5E76\u8BC6\u522B",
  cancel: "\u53D6\u6D88",
  insert: "\u63D2\u5165\u6587\u5B57",
  loading: "\u6B63\u5728\u8BFB\u53D6\u8BC6\u522B\u670D\u52A1\u2026",
  requesting: "\u8BF7\u5141\u8BB8\u4F7F\u7528\u9EA6\u514B\u98CE\u2026",
  recording: "\u6B63\u5728\u5F55\u97F3\u2026",
  interrupted: "\u5F55\u97F3\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  local: "\u97F3\u9891\u5728\u8FD0\u884C DSH \u7684\u673A\u5668\u4E0A\u8BC6\u522B\u3002\u9700\u8981\u4E0B\u8F7D\u6A21\u578B\u65F6\uFF0C\u8BF7\u786E\u4FDD\u8BE5\u673A\u5668\u80FD\u8BBF\u95EE\u6240\u9009\u4E0B\u8F7D\u6E90\u53CA\u5176\u6587\u4EF6\u670D\u52A1\u3002\u5982\u9700\u4EE3\u7406\uFF0C\u8BF7\u5728\u8BE5\u673A\u5668\u4E0A\u914D\u7F6E\u3002",
  cloud: "\u97F3\u9891\u5C06\u53D1\u9001\u81F3\u6240\u9009\u4E91\u7AEF\u670D\u52A1\u3002",
  empty: "\u672A\u8BC6\u522B\u5230\u8BED\u97F3",
  cancelled: "\u5DF2\u53D6\u6D88\u8BED\u97F3\u8F93\u5165\u3002",
  conflict: "\u8349\u7A3F\u5DF2\u88AB\u4FEE\u6539\u3002\u8BC6\u522B\u6587\u5B57\u5DF2\u4FDD\u7559\uFF0C\u53EF\u5728\u5F53\u524D\u5149\u6807\u4F4D\u7F6E\u63D2\u5165\u3002",
  failed: "\u8BED\u97F3\u8BC6\u522B\u5931\u8D25\uFF1A{message}",
  unavailable: "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u5F55\u97F3\uFF0C\u8BF7\u4F7F\u7528\u652F\u6301\u9EA6\u514B\u98CE\u7684\u6D4F\u89C8\u5668\u3002",
  permission: "\u9EA6\u514B\u98CE\u6743\u9650\u672A\u5F00\u542F\uFF0C\u8BF7\u5728\u6D4F\u89C8\u5668\u548C\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u5141\u8BB8\u8BBF\u95EE\u3002",
  tooLarge: "\u5F55\u97F3\u8D85\u8FC7\u670D\u52A1\u9650\u5236\uFF0C\u8BF7\u7F29\u77ED\u5F55\u97F3\u540E\u91CD\u8BD5\u3002"
};
var en = {
  modelsTitle: "Custom ASR models",
  chooseProvider: "Choose a recognition service",
  modelsHelp: "Add local checkpoints on the computer running DSH. Select a saved model below. Python must already have the selected backend installed. Models are never downloaded automatically.",
  modelsEmpty: "No custom models. The upstream recognizer remains available.",
  addModel: "Add ASR model",
  editModel: "Edit model",
  removeModel: "Remove model",
  saveModel: "Save model",
  modelName: "Model name",
  modelEngine: "ASR backend",
  modelPath: "Absolute model path",
  pythonExecutable: "Python executable",
  device: "Device",
  computeType: "Compute precision",
  modelLanguages: "Supported languages (comma separated)",
  modelEnabled: "Enable model",
  computeHelp: "Devices include cpu and cuda. Precision applies only to faster-whisper (for example int8 or float16). Each recognition loads and releases its model; larger checkpoints may load slowly.",
  saveRefused: "Settings were not saved. Check the plugin state and retry.",
  enhancedInput: "Enhanced voice input",
  silenceDetection: "Finish recording after silence",
  silenceDuration: "Trailing silence (milliseconds)",
  enhancementHelp: "Removable enhancements for upstream voice input. Disabling enhanced input restores the upstream control.",
  recognitionSettings: "Recognition model and language settings",
  autoSend: "Send automatically after transcription",
  autoSendHelp: "When enabled, sends the composer contents; otherwise inserts text for editing.",
  autoRead: "Read replies automatically",
  autoReadHelp: "Uses an enabled reply reader with an available speech synthesis service. Historical replies are not read automatically.",
  silenceThreshold: "Speech threshold (RMS)",
  silenceDurationMs: "Trailing silence (ms)",
  silenceHelp: "After speech begins, audio below the threshold for this interval ends recording and transcribes. Default: 1 second.",
  dictate: "Dictate",
  "setupPrompt.title": "Set up speech service before recording",
  "setupPrompt.body": "Speech service is enabled. First recording requires downloading and preparing local recognition models. Open the plugin details to review disk space, memory and time estimates before starting setup.",
  "setupPrompt.later": "Later",
  "setupPrompt.open": "Go to setup",
  "setupPrompt.trigger": "Open speech service setup",
  "setupPrompt.details": "Open voice plugin settings",
  "setupPrompt.unavailableTitle": "Speech recognition is not ready",
  "setupPrompt.unavailableBody": "Open the voice plugin details to check recognition status, preparation progress, or errors.",
  "setup.local": "Local models will be downloaded to the machine running DSH. No Python or compiler is required.",
  "setup.disk": "Disk space",
  "setup.diskValue": "Allow about {gb} GB for models, runtime, and download caches",
  "setup.memory": "Memory",
  "setup.memoryValue": "About {gb} GB with the model loaded; recognition may use more",
  "setup.time": "First setup",
  "setup.timeValue": "Allow roughly {min}\u2013{max} minutes, depending on the network and machine",
  "setup.estimateNote": "These are estimates; slow networks may take longer. Downloads are reused; idle models release memory by default.",
  "step.check": "Check local resources",
  "step.model": "Prepare recognition model",
  "step.vad": "Prepare voice detection model",
  "step.verify": "Verify model files",
  "step.load": "Load {name}",
  "stepStatus.pending": "Not started",
  "stepStatus.running": "In progress",
  "stepStatus.complete": "Completed",
  "stepStatus.failed": "Failed",
  "stepStatus.cancelled": "Cancelled",
  "short.downloading": "Downloading",
  "short.failed": "Setup failed",
  retryRecording: "Record again",
  preparationSteps: "Preparation steps",
  "prepare": "Download and prepare",
  "retryPrepare": "Retry preparation",
  "cancelPrepare": "Cancel preparation",
  "downloadProgress": "Download progress",
  "downloadBytes": "Download: {completed} / {total} MB, {percent}%",
  "downloadUnknown": "Downloaded {completed} MB",
  "elapsed": "Waiting {seconds} seconds",
  "preparationFailed": "Preparation failed: {message}",
  "download.network": "Cannot download {resource}: connection to the download service failed.",
  "download.dns": "Cannot download {resource}: the download address could not be resolved.",
  "download.timeout": "The download of {resource} timed out.",
  "download.certificate": "Cannot download {resource}: certificate verification failed.",
  "download.http": "Cannot download {resource}: the download service returned HTTP {status}.",
  "download.integrity": "The download of {resource} is incomplete or failed verification.",
  "download.storage": "Cannot save {resource}: insufficient disk space or write permission.",
  "download.unknown": "Could not prepare {resource}.",
  "downloadAdvice.network": "Check that the machine running DSH can reach the download source and its model download services. Configure a proxy on that machine if needed, then retry.",
  "downloadAdvice.dns": "Check DNS and proxy settings on the machine running DSH. Confirm that it can resolve the download source domain, then retry.",
  "downloadAdvice.timeout": "Check the network or proxy connection on the machine running DSH, then retry later. Verified downloaded files are retained.",
  "downloadAdvice.certificate": "Check the system clock, trusted certificates and proxy settings on the machine running DSH, then retry.",
  "downloadAdvice.http": "Confirm that the download address is available and the proxy can reach the download service, or retry later.",
  "downloadAdvice.integrity": "Retry the download. Other completed and verified files are retained.",
  "downloadAdvice.storage": "Check available disk space and write permission for the model directory on the machine running DSH, then retry.",
  "downloadAdvice.unknown": "Check the network, disk space and model directory permissions on the machine running DSH, then retry.",
  downloadSource: "Download source: {source}",
  sourceChoice: "Model download source",
  sourceAuto: "Automatic (recommended)",
  sourceHuggingFace: "Hugging Face",
  sourceMirror: "HF-Mirror (China mirror)",
  sourceAutoHelp: "Prefer the first responding source and try another if a download fails.",
  sourceManualHelp: "Download only from the selected source. Verified downloaded files are reused.",
  downloadCode: "Error code: {code}",
  "reconnecting": "Connecting to speech recognition\u2026",
  "preparation.unprepared": "First use downloads the local recognition models.",
  "preparation.checking": "Checking local resources\u2026",
  "preparation.loading": "Loading {name}\u2026",
  "preparation.waking": "Waking local speech recognition\u2026",
  "preparation.ready": "Local speech recognition is ready.",
  "preparation.standby": "Local resources are prepared. Recording wakes the recognizer.",
  "preparation.cancelled": "Preparation cancelled. Completed downloads are retained.",
  "preparation.cancelling": "Cancelling preparation\u2026",
  cloudReady: "Cloud speech recognition is ready.",
  discard: "Discard transcript",
  transcribingShort: "Transcribing\u2026",
  wakingShort: "Waking\u2026",
  provider: "Recognition service",
  language: "Recognition language",
  auto: "Detect automatically",
  zh: "Chinese",
  en: "English",
  yue: "Cantonese",
  ja: "Japanese",
  ko: "Korean",
  start: "Start recording",
  stop: "Stop and transcribe",
  cancel: "Cancel",
  insert: "Insert text",
  loading: "Loading recognition services\u2026",
  requesting: "Allow microphone access to continue\u2026",
  recording: "Recording\u2026",
  interrupted: "Recording was interrupted. Please try again.",
  local: "Audio is recognized on the machine running DSH. If models need downloading, that machine must be able to reach the selected source and its file services. Configure a proxy on that machine if needed.",
  cloud: "Audio will be sent to the selected cloud service.",
  empty: "No speech recognized",
  cancelled: "Voice input cancelled.",
  conflict: "Your draft changed. The transcript is preserved and can be inserted at the current cursor.",
  failed: "Speech recognition failed: {message}",
  unavailable: "This browser cannot record audio. Use a browser with microphone support.",
  permission: "Microphone access is disabled. Allow it in browser and system settings.",
  tooLarge: "The recording exceeds the service limit. Try a shorter recording."
};

// src/client/index.ts
var inject = ["slots", "locale", "configForms", "remote", "remote.speech", "pluginNavigation"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }));
  ctx.effect(() => ctx.locale.register("speech-service-readback", rabiSpeechLocales));
  const form = preferencesForm(ctx.configForms.get("dsh-speech-service"), ctx.configForms.describe());
  const recordings = /* @__PURE__ */ new Set();
  const readiness = observeReadiness(ctx, form);
  ctx.effect(() => readiness.dispose);
  ctx.effect(() => async () => {
    await Promise.all([...recordings].map((recording) => recording.dispose()));
  });
  const openRecognition = () => {
    ctx.pluginNavigation.openBundle("@deepseek-ai/dsh-experimental-voice-input-bundle");
  };
  const actions = {
    openSettings: openRecognition,
    hooks: { speechReadiness: readiness.state },
    createRecording: () => {
      const capture = new Recording(() => {
        recordings.delete(capture);
      });
      recordings.add(capture);
      return capture;
    },
    transcribe: (request, signal) => ctx.remote.speech.transcribe(request, signal),
    configure: async (patch) => {
      const result = await ctx.remote.speech.configure(patch);
      if (!result.ok) throw result.error;
    },
    prepare: async (id, options) => {
      const result = await ctx.remote.speech.prepare(id, options);
      if (!result.ok) throw result.error;
    },
    cancelPreparation: async (id) => {
      const result = await ctx.remote.speech.cancelPreparation(id);
      if (!result.ok) throw result.error;
    }
  };
  let inputDispose;
  const syncInput = () => {
    const snapshot2 = form.getSnapshot();
    const enabled = snapshot2.status === "ready" && snapshot2.value?.enhancedInput === true;
    if (enabled && !inputDispose) inputDispose = ctx.slots.inject("conversation.input.activity", () => ctx.slots.register({
      name: "conversation.input.activity",
      priority: -100,
      locale: NS,
      inject: () => actions
    }, VoiceInput));
    else if (!enabled && inputDispose) {
      inputDispose();
      inputDispose = void 0;
    }
  };
  ctx.effect(() => form.subscribe(syncInput));
  ctx.effect(() => () => {
    inputDispose?.();
    inputDispose = void 0;
  });
  syncInput();
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: "dsh-speech-service",
    locale: NS,
    inject: () => ({ form, openRecognition, configure: actions.configure, hooks: { speechReadiness: readiness.state } })
  }, Settings));
  const autoRead = {
    getSnapshot: () => form.getSnapshot().status === "ready" && form.getSnapshot().value?.autoRead === true,
    subscribe: (listener) => form.subscribe(listener)
  };
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "speech-service-auto-read",
    order: 35,
    locale: "speech-service-readback",
    inject: () => ({ hooks: { rabiAutoRead: autoRead } })
  }, (props) => React3.createElement(RabiAutoSpeech, { ...props, key: props.sessionId })));
}

 const implementation = module.exports;
 return { inject: implementation.inject, apply: ctx => {
 ctx.effect(() => { const style = document.createElement('style'); style.dataset.speechServiceEnhancement = ''; style.textContent = "/* src/client/VoiceInput.module.css */\n.VoiceInput_trigger {\n  width: 28px;\n  padding: 0;\n  flex: none;\n}\n.VoiceInput_triggerAnchor {\n  display: inline-flex;\n  flex: none;\n}\n.VoiceInput_captureRow {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  width: 100%;\n  min-width: 0;\n  min-height: 34px;\n}\n.VoiceInput_roundButton {\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border-radius: 50%;\n  corner-shape: round;\n  flex: none;\n  background: var(--dsw-specific-selector);\n}\n.VoiceInput_roundButton:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n.VoiceInput_waveform {\n  display: block;\n  flex: 1;\n  width: 0;\n  height: 24px;\n  min-width: 24px;\n  color: var(--dsw-alias-label-secondary);\n}\n.VoiceInput_activityMessage {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: 1;\n  min-width: 0;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n.VoiceInput_inlineAction {\n  flex: none;\n}\n.VoiceInput_preparation {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 14px;\n  margin: 12px 0;\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  font-size: 13px;\n}\n.VoiceInput_preparation p {\n  margin: 0;\n}\n.VoiceInput_preparationActions {\n  display: flex;\n  gap: 8px;\n}\n.VoiceInput_preparationActions:empty {\n  display: none;\n}\n.VoiceInput_preparationError {\n  color: var(--dsw-alias-state-error-primary);\n  overflow-wrap: anywhere;\n  font-size: 12px;\n}\n.VoiceInput_downloadFailure {\n  display: grid;\n  gap: 6px;\n  overflow-wrap: anywhere;\n}\n.VoiceInput_summaryRow {\n  min-height: 28px;\n  height: auto;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n.VoiceInput_summaryTitle {\n  flex: 1;\n  min-width: 0;\n}\n.VoiceInput_metric {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n.VoiceInput_progress {\n  width: 100%;\n  height: 6px;\n  accent-color: var(--dsw-alias-state-business-primary);\n}\n.VoiceInput_steps {\n  list-style: none;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  padding: 16px 0 2px;\n  margin: 0;\n}\n.VoiceInput_steps li {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  line-height: 18px;\n}\n.VoiceInput_steps li > :first-child {\n  margin-top: 1px;\n}\n.VoiceInput_steps li[data-step-state=pending] {\n  color: var(--dsw-alias-label-tertiary);\n}\n.VoiceInput_stepBody {\n  flex: 1;\n  min-width: 0;\n}\n.VoiceInput_stepProgress {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-top: 6px;\n}\n.VoiceInput_stepProgress small {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  overflow-wrap: anywhere;\n}\n.VoiceInput_preferences {\n  display: grid;\n  gap: 12px;\n  font-size: 13px;\n  margin: 18px 0;\n}\n.VoiceInput_preferences label,\n.VoiceInput_sourceChoice label {\n  display: grid;\n  grid-template-columns: 100px minmax(120px, 280px);\n  align-items: center;\n  gap: 12px;\n}\n.VoiceInput_preferences select,\n.VoiceInput_sourceChoice select {\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 6px;\n  padding: 6px 10px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n.VoiceInput_sourceChoice {\n  display: grid;\n  gap: 6px;\n}\n.VoiceInput_preferences p {\n  margin: 0;\n}\n.VoiceInput_models,\n.VoiceInput_modelEditor {\n  display: grid;\n  gap: 12px;\n  min-width: 0;\n}\n.VoiceInput_modelRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  padding: 12px;\n}\n.VoiceInput_modelRow code {\n  flex-basis: 100%;\n  overflow-wrap: anywhere;\n}\n.VoiceInput_modelRow label {\n  display: flex;\n  gap: 8px;\n}\n.VoiceInput_modelEditor {\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  padding: 12px;\n}\n.VoiceInput_modelEditor label {\n  grid-template-columns: minmax(100px, 160px) minmax(0, 1fr);\n}\n@media (max-width: 480px) {\n  .VoiceInput_modelEditor label {\n    grid-template-columns: 1fr;\n    gap: 6px;\n  }\n}\n.VoiceInput_preferences input[type=number] {\n  min-width: 0;\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 6px;\n  padding: 6px 10px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n.VoiceInput_preferences input[type=checkbox] {\n  justify-self: start;\n  accent-color: var(--dsw-alias-state-business-primary);\n}\n.VoiceInput_settingsCard {\n  list-style: none;\n  padding: 16px;\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n}\n.VoiceInput_settingsCard > p {\n  font-size: 13px;\n  color: var(--dsw-alias-label-secondary);\n  margin: 8px 0 0;\n}\n.VoiceInput_setupEstimate {\n  display: grid;\n  gap: 10px;\n  padding: 12px;\n  border-radius: 8px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  line-height: 1.6;\n}\n.VoiceInput_setupEstimate dl {\n  display: grid;\n  gap: 6px;\n  margin: 0;\n}\n.VoiceInput_setupEstimate dl > div {\n  display: grid;\n  grid-template-columns: 72px minmax(0, 1fr);\n  gap: 10px;\n}\n.VoiceInput_setupEstimate dt {\n  color: var(--dsw-alias-label-tertiary);\n}\n.VoiceInput_setupEstimate dd {\n  margin: 0;\n}\n.VoiceInput_setupEstimate small {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n"; document.head.append(style); return () => style.remove(); });
 return implementation.apply(ctx);
 } };
 }
});
