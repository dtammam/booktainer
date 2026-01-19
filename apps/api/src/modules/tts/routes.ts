import type { FastifyInstance } from "fastify";
import { ttsInstallVoiceSchema, ttsSpeakSchema, ttsSpeakUrlSchema } from "./schemas";
import { createTtsToken, getDefaultTtsSelection, getTtsToken, listTtsVoices, speakTts } from "./service";
import { getPiperCatalog, installPiperVoice } from "../../providers/tts/piper";

export function registerTtsRoutes(app: FastifyInstance) {
  app.get("/api/tts/voices", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const { online, offline } = await listTtsVoices();
    const defaults = getDefaultTtsSelection({ online, offline });
    return reply.send({
      online,
      offline,
      defaultMode: defaults.defaultMode,
      defaultVoice: defaults.defaultVoice
    });
  });

  app.post("/api/tts/speak", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const parsed = ttsSpeakSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    try {
      const result = await speakTts({
        mode: parsed.data.mode,
        voice: parsed.data.voice,
        rate: parsed.data.rate ?? 1,
        text: parsed.data.text
      });
      reply.header("Cache-Control", "no-store");
      reply.header("Content-Type", result.contentType);
      if (result.contentLength) {
        reply.header("Content-Length", result.contentLength.toString());
      }
      return reply.send(result.stream);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "TTS failed" });
    }
  });

  app.post("/api/tts/speak-url", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const parsed = ttsSpeakUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    const token = createTtsToken(request.user.id, {
      mode: parsed.data.mode,
      voice: parsed.data.voice,
      rate: parsed.data.rate ?? 1,
      text: parsed.data.text
    });
    return reply.send({ url: `/api/tts/speak/${token}` });
  });

  app.get("/api/tts/speak/:token", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const token = (request.params as { token: string }).token;
    const entry = getTtsToken(token);
    if (!entry || entry.userId !== request.user.id) {
      return reply.code(404).send({ error: "Not found" });
    }
    try {
      const result = await speakTts(entry.input);
      reply.header("Cache-Control", "no-store");
      reply.header("Content-Type", result.contentType);
      if (result.contentLength) {
        reply.header("Content-Length", result.contentLength.toString());
      }
      return reply.send(result.stream);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "TTS failed" });
    }
  });

  app.post("/api/tts/offline/install-voice", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!request.user.isAdmin) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const parsed = ttsInstallVoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    try {
      const voice = await installPiperVoice(parsed.data.voice);
      return reply.send({ voice, catalog: getPiperCatalog() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Install failed";
      return reply.code(400).send({ error: message });
    }
  });
}
