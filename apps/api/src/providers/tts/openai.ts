import { Readable } from "node:stream";
import { env } from "../../env";
import type { TtsProvider, TtsSpeakRequest, TtsSpeakResponse, TtsVoice } from "./interface";

const OPENAI_TTS_VOICES: TtsVoice[] = [
  { id: "alloy", name: "Alloy" },
  { id: "ash", name: "Ash" },
  { id: "ballad", name: "Ballad" },
  { id: "coral", name: "Coral" },
  { id: "echo", name: "Echo" },
  { id: "fable", name: "Fable" },
  { id: "onyx", name: "Onyx" },
  { id: "nova", name: "Nova" },
  { id: "sage", name: "Sage" },
  { id: "shimmer", name: "Shimmer" },
  { id: "verse", name: "Verse" },
  { id: "cedar", name: "Cedar" },
  { id: "marin", name: "Marin" }
];

export function createOpenAiProvider(): TtsProvider {
  return {
    async listVoices() {
      return OPENAI_TTS_VOICES;
    },
    async speak(input: TtsSpeakRequest): Promise<TtsSpeakResponse> {
      if (!env.openAiApiKey) {
        throw new Error("OPENAI_API_KEY is required.");
      }
      if (!OPENAI_TTS_VOICES.some((voice) => voice.id === input.voice)) {
        throw new Error("Unknown voice.");
      }
      const speed = Math.max(0.5, Math.min(input.rate || 1, 2.0));
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.openAiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.openAiTtsModel,
          voice: input.voice,
          input: input.text,
          format: "mp3",
          speed
        })
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || "OpenAI TTS request failed.");
      }
      const stream = Readable.fromWeb(res.body as unknown as ReadableStream);
      return {
        stream,
        contentType: "audio/mpeg"
      };
    }
  };
}
