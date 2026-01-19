import type { FastifyInstance } from "fastify";
import { getBookRecord, listBookRecords, removeBook, updateBookRecord } from "./service";

export function registerBookRoutes(app: FastifyInstance) {
  app.get("/api/books", async (request, reply) => {
    const sort = (request.query as { sort?: string }).sort || "dateAdded";
    const q = (request.query as { q?: string }).q || null;
    const sortKey = (sort === "title" || sort === "author" || sort === "dateAdded") ? sort : "dateAdded";
    const response = listBookRecords(sortKey, q);
    return reply.send(response);
  });

  app.get("/api/books/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const record = getBookRecord(id);
    if (!record) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send(record);
  });

  app.patch("/api/books/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as { title?: string; author?: string | null };
    let title: string | undefined;
    if (body.title !== undefined) {
      title = body.title.trim();
      if (!title) {
        return reply.code(400).send({ error: "Missing title" });
      }
    }
    const updated = updateBookRecord(id, title, body.author);
    if (!updated) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send(updated);
  });

  app.delete("/api/books/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const removed = await removeBook(id);
    if (!removed) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send({ ok: true });
  });
}
