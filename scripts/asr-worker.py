"""One managed local transcription; models and Python dependencies must already exist."""
import contextlib
import json
import os
import sys
import time
import traceback
import wave
from pathlib import Path


def recognize(request):
    """Load the selected local checkpoint and return measured transcription fields."""
    model = request["model"]
    path = Path(model["modelPath"])
    if not path.is_absolute() or not path.exists():
        raise ValueError("ASR model path must name an existing absolute local path")
    with wave.open(request["audioPath"], "rb") as audio:
        seconds = audio.getnframes() / audio.getframerate()
    if model["engine"] == "faster-whisper":
        from faster_whisper import WhisperModel
        recognizer = WhisperModel(str(path), device=model["device"], compute_type=model["computeType"], local_files_only=True)
        started = time.perf_counter()
        language = None if request["language"] == "auto" else request["language"]
        segments, _ = recognizer.transcribe(request["audioPath"], language=language)
        text = "".join(segment.text for segment in segments).strip()
    elif model["engine"] == "funasr":
        from funasr import AutoModel
        from funasr.utils.postprocess_utils import rich_transcription_postprocess
        recognizer = AutoModel(model=str(path), device=model["device"], disable_update=True, trust_remote_code=False)
        started = time.perf_counter()
        results = recognizer.generate(input=request["audioPath"], language=request["language"])
        text = "".join(rich_transcription_postprocess(result.get("text", "")) for result in results).strip()
    else:
        raise ValueError("Unsupported ASR engine")
    return {"text": text, "audioSeconds": seconds, "inferenceSeconds": time.perf_counter() - started}


def main():
    """Write queryable process identity and local diagnostics; stdout contains no transcript."""
    request = json.load(sys.stdin)
    record = {"purpose": "DSH local ASR transcription", "modelId": request["model"]["id"], "pid": os.getpid(),
              "parentPid": os.getppid(), "startedAt": time.time(), "launchSource": "dsh-speech-service / ctx.subprocess",
              "callId": request["callId"], "log": request["log"], "state": "running"}
    Path(request["record"]).write_text(json.dumps(record), encoding="utf-8")
    try:
        with open(request["log"], "a", encoding="utf-8") as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            try:
                result = recognize(request)
                Path(request["resultPath"]).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            except Exception:
                traceback.print_exc()
                raise
        record["state"] = "completed"
    except Exception as error:
        record["state"] = "failed"
        print(f"{type(error).__name__}: {error}; diagnostics: {request['log']}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        record["finishedAt"] = time.time()
        Path(request["record"]).write_text(json.dumps(record), encoding="utf-8")


if __name__ == "__main__":
    main()
