import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { env } from "./env";
import { db } from "./db";
import { runMigrations } from "./db/migrations";
import { dataPaths } from "./paths";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerBookRoutes } from "./modules/books/routes";
import { registerProgressRoutes } from "./modules/progress/routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerTtsRoutes } from "./modules/tts/routes";
import { bootstrapAdmin, resolveRequestUser } from "./modules/auth/service";
import { ensureDefaultOwnership } from "./modules/books/ownership";

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
  await fsp.mkdir(dataPaths.ttsCache, { recursive: true });
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

app.decorateRequest("user", null);
app.addHook("preHandler", async (request) => {
  request.user = await resolveRequestUser(request);
});

registerHealthRoutes(app);
registerBookRoutes(app);
registerProgressRoutes(app);
registerAuthRoutes(app);
registerAdminRoutes(app);
registerTtsRoutes(app);

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
  if (!env.sessionSecret) {
    throw new Error("SESSION_SECRET is required.");
  }
  runMigrations(db, { stopBefore: "0004_user_scope_enforce.sql" });
  await bootstrapAdmin();
  ensureDefaultOwnership();
  runMigrations(db);
  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`Server listening on ${env.port}`);
}

start().catch((err) => {
  app.log.error(err, "Failed to start server");
  process.exit(1);
});
