import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { lookup as lookupMime } from "mime-types";
import { getProgress, setProgress } from "./db";
import { env } from "./env";
import { dataPaths } from "./paths";
import type { BookProgressResponse } from "@booktainer/shared";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerBookRoutes } from "./modules/books/routes";
import { getBook } from "./modules/books/repo";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty"
    }
  }
});

async function ensureDataDirs() {
  await fsp.mkdir(dataPaths.library, { recursive: true });
  await fsp.mkdir(dataPaths.covers, { recursive: true });
  await fsp.mkdir(dataPaths.tmp, { recursive: true });
}

app.register(multipart, {
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024
  }
});

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.register(fastifyStatic, {
    root: webDist,
    prefix: "/"
  });
}

registerHealthRoutes(app);
registerBookRoutes(app);

app.get("/api/books/:id/file", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const row = getBook(id);
  if (!row) {
    return reply.code(404).send({ error: "Not found" });
  }
  const filePath = row.filePathCanonical || row.filePathOriginal;
  const mime = lookupMime(filePath) || "application/octet-stream";
  const stat = await fsp.stat(filePath);
  const range = request.headers.range;
  reply.header("Accept-Ranges", "bytes");

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d+)?/);
    if (match) {
      const start = Number.parseInt(match[1], 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      reply.code(206);
      reply.header("Content-Type", mime);
      reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      reply.header("Content-Length", chunkSize.toString());
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }
  }

  reply.header("Content-Type", mime);
  reply.header("Content-Length", stat.size.toString());
  return reply.send(fs.createReadStream(filePath));
});

app.get("/api/books/:id/cover", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const row = getBook(id);
  if (!row || !row.coverPath) {
    return reply.code(404).send({ error: "Not found" });
  }
  const mime = lookupMime(row.coverPath) || "application/octet-stream";
  reply.header("Content-Type", mime);
  return reply.send(fs.createReadStream(row.coverPath));
});

app.get("/api/books/:id/progress", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const progress = getProgress(id);
  const response: BookProgressResponse = {
    progress: progress
      ? {
          bookId: progress.bookId,
          location: JSON.parse(progress.locationJson) as Record<string, unknown>,
          updatedAt: progress.updatedAt
        }
      : null
  };
  return reply.send(response);
});

app.post("/api/books/:id/progress", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const body = request.body as { location?: Record<string, unknown> };
  if (!body?.location) {
    return reply.code(400).send({ error: "Missing location" });
  }
  const updatedAt = new Date().toISOString();
  setProgress(id, JSON.stringify(body.location), updatedAt);
  return reply.send({ ok: true });
});


app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  if (fs.existsSync(webDist)) {
    const indexPath = path.join(webDist, "index.html");
    return reply.type("text/html").send(fs.createReadStream(indexPath));
  }
  return reply.code(404).send({ error: "Not found" });
});

async function start() {
  await ensureDataDirs();
  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`Server listening on ${env.port}`);
}

start().catch((err) => {
  app.log.error(err, "Failed to start server");
  process.exit(1);
});
