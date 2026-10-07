"""Backend adapter contracts without downloading checkpoints or installing inference engines."""
import importlib.util
import sys
import tempfile
import types
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "scripts" / "asr-worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class Backends(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        audio = self.path / "audio.wav"
        with wave.open(str(audio), "wb") as file:
            file.setnchannels(1)
            file.setsampwidth(2)
            file.setframerate(16000)
            file.writeframes(b"\0" * 32000)
        self.request = {"model": {"modelPath": str(self.path), "device": "cpu", "computeType": "int8"}, "audioPath": str(audio), "language": "auto"}

    def test_whisper_local_only_and_consumes_lazy_segments(self):
        calls = []
        class Whisper:
            def __init__(self, path, **kwargs):
                calls.append((path, kwargs))
            def transcribe(self, audio, language):
                calls.append((audio, language))
                return iter([types.SimpleNamespace(text=" 测试 ")]), None
        self.request["model"]["engine"] = "faster-whisper"
        with patch.dict(sys.modules, {"faster_whisper": types.SimpleNamespace(WhisperModel=Whisper)}):
            result = worker.recognize(self.request)
        self.assertEqual(result["text"], "测试")
        self.assertEqual(result["audioSeconds"], 1)
        self.assertTrue(calls[0][1]["local_files_only"])
        self.assertIsNone(calls[1][1])

    def test_funasr_disables_updates_and_model_python_code(self):
        calls = []
        class Fun:
            def __init__(self, **kwargs):
                calls.append(kwargs)
            def generate(self, **kwargs):
                calls.append(kwargs)
                return [{"text": "识别"}, {"text": "结果"}]
        self.request["model"]["engine"] = "funasr"
        with patch.dict(sys.modules, {"funasr": types.SimpleNamespace(AutoModel=Fun),
                                     "funasr.utils.postprocess_utils": types.SimpleNamespace(rich_transcription_postprocess=lambda text: text)}):
            result = worker.recognize(self.request)
        self.assertEqual(result["text"], "识别结果")
        self.assertTrue(calls[0]["disable_update"])
        self.assertFalse(calls[0]["trust_remote_code"])
        self.assertEqual(calls[1]["language"], "auto")


if __name__ == "__main__":
    unittest.main()
