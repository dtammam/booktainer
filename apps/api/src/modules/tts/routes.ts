import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { ttsInstallVoiceSchema, ttsSpeakSchema, ttsSpeakUrlSchema } from "./schemas";
import { createTtsToken, getDefaultTtsSelection, getTtsToken, listTtsVoices, speakTts } from "./service";
import { getPiperCatalog, installPiperVoice } from "../../providers/tts/piper";

export function registerTtsRoutes(app: FastifyInstance) {
  const sanitizeText = (input: string) => input.replace(/[\uD800-\uDFFF]/g, "").trim();
  const parseRange = (range: string | undefined, size: number) => {
    if (!range) return null;
    const match = range.match(/bytes=(\d+)-(\d+)?/);
    if (!match) return null;
    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    return { start, end, chunkSize: end - start + 1 };
  };

  const cleanupFile = (filePath: string) => {
    fs.promises.unlink(filePath).catch(() => null);
  };

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
    const safeText = sanitizeText(parsed.data.text);
    if (!safeText) {
      return reply.code(400).send({ error: "Text is empty after sanitization" });
    }
    try {
      const result = await speakTts({
        mode: parsed.data.mode,
        voice: parsed.data.voice,
        rate: parsed.data.rate ?? 1,
        text: safeText
      });
      reply.header("Cache-Control", "no-store");
      if (result.filePath) {
        const stat = await fs.promises.stat(result.filePath);
        const range = parseRange(request.headers.range, stat.size);
        reply.header("Content-Type", result.contentType);
        reply.header("Accept-Ranges", "bytes");
        if (range) {
          reply.code(206);
          reply.header("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
          reply.header("Content-Length", range.chunkSize.toString());
          const stream = fs.createReadStream(result.filePath, { start: range.start, end: range.end });
          if (!result.cacheFile) {
            stream.on("close", () => cleanupFile(result.filePath!));
          }
          return reply.send(stream);
        }
        reply.header("Content-Length", stat.size.toString());
        const stream = fs.createReadStream(result.filePath);
        if (!result.cacheFile) {
          stream.on("close", () => cleanupFile(result.filePath!));
        }
        return reply.send(stream);
      }
      reply.header("Content-Type", result.contentType);
      if (result.contentLength) {
        reply.header("Content-Length", result.contentLength.toString());
      }
      if (!result.stream) {
        return reply.code(500).send({ error: "TTS stream unavailable" });
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
    const safeText = sanitizeText(parsed.data.text);
    if (!safeText) {
      return reply.code(400).send({ error: "Text is empty after sanitization" });
    }
    const token = createTtsToken(request.user.id, {
      mode: parsed.data.mode,
      voice: parsed.data.voice,
      rate: parsed.data.rate ?? 1,
      text: safeText
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
      if (result.filePath) {
        const stat = await fs.promises.stat(result.filePath);
        const range = parseRange(request.headers.range, stat.size);
        reply.header("Content-Type", result.contentType);
        reply.header("Accept-Ranges", "bytes");
        if (range) {
          reply.code(206);
          reply.header("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
          reply.header("Content-Length", range.chunkSize.toString());
          const stream = fs.createReadStream(result.filePath, { start: range.start, end: range.end });
          if (!result.cacheFile) {
            stream.on("close", () => cleanupFile(result.filePath!));
          }
          return reply.send(stream);
        }
        reply.header("Content-Length", stat.size.toString());
        const stream = fs.createReadStream(result.filePath);
        if (!result.cacheFile) {
          stream.on("close", () => cleanupFile(result.filePath!));
        }
        return reply.send(stream);
      }
      reply.header("Content-Type", result.contentType);
      if (result.contentLength) {
        reply.header("Content-Length", result.contentLength.toString());
      }
      if (!result.stream) {
        return reply.code(500).send({ error: "TTS stream unavailable" });
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
