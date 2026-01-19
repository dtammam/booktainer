import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { getProgress, setProgress } from "./db";
import { env } from "./env";
import { dataPaths } from "./paths";
import type { BookProgressResponse } from "@booktainer/shared";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerBookRoutes } from "./modules/books/routes";

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
