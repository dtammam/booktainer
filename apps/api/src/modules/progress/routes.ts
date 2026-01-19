import type { FastifyInstance } from "fastify";
import { getBookProgress, setBookProgress } from "./service";

export function registerProgressRoutes(app: FastifyInstance) {
  app.get("/api/books/:id/progress", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const response = getBookProgress(request.user.id, id);
    if (!response) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send(response);
  });

  app.post("/api/books/:id/progress", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const body = request.body as { location?: Record<string, unknown> };
    if (!body?.location) {
      return reply.code(400).send({ error: "Missing location" });
    }
    const ok = setBookProgress(request.user.id, id, body.location);
    if (!ok) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send({ ok: true });
  });
}
