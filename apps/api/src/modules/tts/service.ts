import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { TtsSpeakInput } from "../../providers/tts/registry";
import { listAllVoices, resolveProvider } from "../../providers/tts/registry";
import { getSessionTtlSeconds } from "../auth/service";
import { dataPaths } from "../../paths";

type TtsTokenEntry = {
  input: TtsSpeakInput;
  expiresAt: number;
  userId: string;
};

const tokenStore = new Map<string, TtsTokenEntry>();

type CacheHit = {
  filePath: string;
  contentType: string;
  contentLength: number;
};

function getCacheKey(input: TtsSpeakInput) {
  const hash = crypto.createHash("sha256");
  hash.update(input.mode);
  hash.update("|");
  hash.update(input.voice);
  hash.update("|");
  hash.update(String(input.rate ?? 1));
  hash.update("|");
  hash.update(input.text);
  return hash.digest("hex");
}

function getCachePath(key: string, contentType: string) {
  const ext = contentType === "audio/mpeg" ? "mp3" : "wav";
  return path.join(dataPaths.ttsCache, `tts-${key}.${ext}`);
}

async function findCachedAudio(key: string): Promise<CacheHit | null> {
  const candidates = [
    { contentType: "audio/mpeg", ext: "mp3" },
    { contentType: "audio/wav", ext: "wav" }
  ];
  for (const candidate of candidates) {
    const filePath = path.join(dataPaths.ttsCache, `tts-${key}.${candidate.ext}`);
    try {
      const stat = await fsp.stat(filePath);
      if (stat.isFile() && stat.size > 0) {
        return { filePath, contentType: candidate.contentType, contentLength: stat.size };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function cacheFile(sourcePath: string, cachePath: string) {
  try {
    await fsp.copyFile(sourcePath, cachePath, fs.constants.COPYFILE_EXCL);
  } catch {
    return;
  }
}

function cacheStream(source: NodeJS.ReadableStream, cachePath: string) {
  const passThrough = new PassThrough();
  const fileStream = fs.createWriteStream(cachePath, { flags: "wx" });
  source.on("error", (err) => {
    passThrough.destroy(err);
    fileStream.destroy(err as Error);
  });
  fileStream.on("error", (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      fsp.unlink(cachePath).catch(() => null);
    }
  });
  fileStream.on("close", async () => {
    try {
      const stat = await fsp.stat(cachePath);
      if (stat.size === 0) {
        await fsp.unlink(cachePath);
      }
    } catch {
      return;
    }
  });
  source.pipe(passThrough);
  source.pipe(fileStream);
  return passThrough;
}

function pruneExpiredTokens(now: number) {
  for (const [token, entry] of tokenStore.entries()) {
    if (entry.expiresAt <= now) {
      tokenStore.delete(token);
    }
  }
}

export async function listTtsVoices() {
  return listAllVoices();
}

export function getDefaultTtsSelection(voices: { online: { id: string }[]; offline: { id: string }[] }) {
  const defaultMode = voices.offline.length > 0
    ? "offline"
    : voices.online.length > 0
      ? "online"
      : "offline";
  const defaultVoice = defaultMode === "offline"
    ? voices.offline[0]?.id || ""
    : voices.online[0]?.id || "";
  return { defaultMode, defaultVoice };
}

export function speakTts(input: TtsSpeakInput) {
  const provider = resolveProvider(input.mode);
  if (!provider) {
    throw new Error(input.mode === "online"
      ? "Online TTS not configured."
      : "Offline TTS not available.");
  }
  const rate = input.rate ?? 1;
  return (async () => {
    const normalized: TtsSpeakInput = {
      text: input.text,
      voice: input.voice,
      mode: input.mode,
      rate
    };
    const cacheKey = getCacheKey(normalized);
    const cacheHit = await findCachedAudio(cacheKey);
    if (cacheHit) {
      return {
        filePath: cacheHit.filePath,
        contentType: cacheHit.contentType,
        contentLength: cacheHit.contentLength,
        cacheFile: true
      };
    }
    const result = await provider.speak({
      text: normalized.text,
      voice: normalized.voice,
      rate: normalized.rate ?? 1
    });
    if (result.filePath) {
      const cachePath = getCachePath(cacheKey, result.contentType);
      await cacheFile(result.filePath, cachePath);
      return result;
    }
    if (result.stream) {
      const cachePath = getCachePath(cacheKey, result.contentType);
      const stream = cacheStream(result.stream, cachePath);
      return { ...result, stream };
    }
    return result;
  })();
}

export function createTtsToken(userId: string, input: TtsSpeakInput) {
  const ttlSeconds = Math.min(getSessionTtlSeconds(), 300);
  const token = crypto.randomUUID();
  pruneExpiredTokens(Date.now());
  tokenStore.set(token, {
    input,
    userId,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
  return token;
}

export function getTtsToken(token: string) {
  const entry = tokenStore.get(token);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  return entry;
}
