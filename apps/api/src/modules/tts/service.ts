import { listAllVoices, resolveProvider, type TtsSpeakInput } from "../../providers/tts/registry";

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
