import { env } from "../../env";
import type { TtsProvider, TtsSpeakRequest, TtsVoice } from "./interface";
import { createOpenAiProvider } from "./openai";
import { createPiperProvider } from "./piper";

export type TtsMode = "online" | "offline";

export type TtsSpeakInput = TtsSpeakRequest & {
  mode: TtsMode;
};

let openAiProvider: TtsProvider | null = null;
let piperProvider: TtsProvider | null = null;

function getOpenAiProvider() {
  if (!env.openAiApiKey) {
    return null;
  }
  if (!openAiProvider) {
    openAiProvider = createOpenAiProvider();
  }
  return openAiProvider;
}

function getPiperProvider() {
  if (!piperProvider) {
    piperProvider = createPiperProvider();
  }
  return piperProvider;
}

export function resolveProvider(mode: TtsMode): TtsProvider | null {
  return mode === "online" ? getOpenAiProvider() : getPiperProvider();
}

export function listProvidersVoices() {
  const onlineProvider = getOpenAiProvider();
  const offlineProvider = getPiperProvider();
  const online = onlineProvider ? onlineProvider.listVoices() : Promise.resolve([]);
  const offline = offlineProvider ? offlineProvider.listVoices() : Promise.resolve([]);
  return {
    online,
    offline
  };
}

export async function listAllVoices(): Promise<{ online: TtsVoice[]; offline: TtsVoice[] }> {
  const providers = listProvidersVoices();
  const [online, offline] = await Promise.all([providers.online, providers.offline]);
  return { online, offline };
}
