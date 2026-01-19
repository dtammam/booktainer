import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { env } from "../../env";
import type { TtsProvider, TtsSpeakRequest, TtsSpeakResponse, TtsVoice } from "./interface";

type PiperVoiceSpec = {
  id: string;
  name: string;
  locale: string;
  onnxUrl: string;
  configUrl: string;
};

const PIPER_VOICE_CATALOG: PiperVoiceSpec[] = [
  {
    id: "en_US-ryan-medium",
    name: "Ryan (en-US)",
    locale: "en-US",
    onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx",
    configUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json"
  },
  {
    id: "en_US-amy-medium",
    name: "Amy (en-US)",
    locale: "en-US",
    onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
    configUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
  },
  {
    id: "en_US-lessac-medium",
    name: "Lessac (en-US)",
    locale: "en-US",
    onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    configUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
  },
  {
    id: "en_GB-alba-medium",
    name: "Alba (en-GB)",
    locale: "en-GB",
    onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx",
    configUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json"
  }
];

function ensureVoicesDir() {
  fs.mkdirSync(env.piperVoicesDir, { recursive: true });
}

function getVoicePaths(voiceId: string) {
  return {
    modelPath: path.join(env.piperVoicesDir, `${voiceId}.onnx`),
    configPath: path.join(env.piperVoicesDir, `${voiceId}.onnx.json`)
  };
}

function assertCommandAvailable(command: string) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  if (result.error) {
    throw new Error(`${command} is not available on PATH.`);
  }
}

function listInstalledVoices(): TtsVoice[] {
  ensureVoicesDir();
  const entries = fs.readdirSync(env.piperVoicesDir);
  const onnxFiles = entries.filter((file) => file.endsWith(".onnx"));
  return onnxFiles.map((file) => {
    const id = file.replace(/\.onnx$/, "");
    const meta = PIPER_VOICE_CATALOG.find((voice) => voice.id === id);
    return {
      id,
      name: meta?.name || id,
      locale: meta?.locale
    };
  });
}

async function downloadFile(url: string, targetPath: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}`);
  }
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    const stream = Readable.fromWeb(res.body as unknown as import("stream/web").ReadableStream);
    stream.pipe(file);
    stream.on("error", reject);
    file.on("finish", () => resolve());
    file.on("error", reject);
  });
}

export async function installPiperVoice(voiceId: string) {
  ensureVoicesDir();
  const voice = PIPER_VOICE_CATALOG.find((entry) => entry.id === voiceId);
  if (!voice) {
    throw new Error("Unknown Piper voice.");
  }
  const { modelPath, configPath } = getVoicePaths(voiceId);
  if (!fs.existsSync(modelPath)) {
    await downloadFile(voice.onnxUrl, modelPath);
  }
  if (!fs.existsSync(configPath)) {
    await downloadFile(voice.configUrl, configPath);
  }
  return { id: voiceId, name: voice.name, locale: voice.locale };
}

export function createPiperProvider(): TtsProvider {
  return {
    async listVoices() {
      return listInstalledVoices();
    },
    async speak(input: TtsSpeakRequest): Promise<TtsSpeakResponse> {
      const { modelPath, configPath } = getVoicePaths(input.voice);
      if (!fs.existsSync(modelPath) || !fs.existsSync(configPath)) {
        throw new Error("Piper voice not installed.");
      }
      assertCommandAvailable("piper");
      assertCommandAvailable("ffmpeg");

      const lengthScale = Math.max(0.5, Math.min(2, 1 / Math.max(input.rate || 1, 0.5)));
      const piper = spawn("piper", [
        "--model", modelPath,
        "--config", configPath,
        "--length_scale", lengthScale.toString(),
        "--output_file", "-"
      ]);

      piper.stdin.write(input.text);
      piper.stdin.end();

      const ffmpeg = spawn("ffmpeg", [
        "-loglevel", "error",
        "-f", "wav",
        "-i", "pipe:0",
        "-f", "mp3",
        "pipe:1"
      ]);

      piper.stdout.pipe(ffmpeg.stdin);

      return {
        stream: ffmpeg.stdout,
        contentType: "audio/mpeg"
      };
    }
  };
}

export function getPiperCatalog(): TtsVoice[] {
  return PIPER_VOICE_CATALOG.map((voice) => ({
    id: voice.id,
    name: voice.name,
    locale: voice.locale
  }));
}
