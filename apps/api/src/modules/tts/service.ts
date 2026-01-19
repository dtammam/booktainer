import crypto from "node:crypto";
import type { TtsSpeakInput } from "../../providers/tts/registry";
import { listAllVoices, resolveProvider } from "../../providers/tts/registry";
import { getSessionTtlSeconds } from "../auth/service";

type TtsTokenEntry = {
  input: TtsSpeakInput;
  expiresAt: number;
  userId: string;
};

const tokenStore = new Map<string, TtsTokenEntry>();

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
  return provider.speak({
    text: input.text,
    voice: input.voice,
    rate
  });
}

export function createTtsToken(userId: string, input: TtsSpeakInput) {
  const ttlSeconds = Math.min(getSessionTtlSeconds(), 300);
  const token = crypto.randomUUID();
  tokenStore.set(token, {
    input,
    userId,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
  return token;
}

export function consumeTtsToken(token: string) {
  const entry = tokenStore.get(token);
  if (!entry) {
    return null;
  }
  tokenStore.delete(token);
  if (entry.expiresAt <= Date.now()) {
    return null;
  }
  return entry;
}
