import type { FastifyInstance } from "fastify";
import { getBookProgress, setBookProgress } from "./service";

export function registerProgressRoutes(app: FastifyInstance) {
  app.get("/api/books/:id/progress", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const response = getBookProgress(id);
    return reply.send(response);
  });

  app.post("/api/books/:id/progress", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as { location?: Record<string, unknown> };
    if (!body?.location) {
      return reply.code(400).send({ error: "Missing location" });
    }
    setBookProgress(id, body.location);
    return reply.send({ ok: true });
  });
}
