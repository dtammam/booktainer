import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../../env";
import { getBookCoverStream, getBookFileStream, getBookRecord, listBookRecords, removeBook, updateBookRecord, uploadBook } from "./service";

function normalizeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  return ext;
}

function formatFromExtension(ext: string) {
  if (ext === "pdf" || ext === "epub" || ext === "mobi" || ext === "txt" || ext === "md") {
    return ext;
  }
  return null;
}

export function registerBookRoutes(app: FastifyInstance) {
  app.get("/api/books", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const sort = (request.query as { sort?: string }).sort || "dateAdded";
    const q = (request.query as { q?: string }).q || null;
    const sortKey = (sort === "title" || sort === "author" || sort === "dateAdded") ? sort : "dateAdded";
    const response = listBookRecords(request.user.id, sortKey, q);
    return reply.send(response);
  });

  app.get("/api/books/:id", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const record = getBookRecord(request.user.id, id);
    if (!record) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send(record);
  });

  app.patch("/api/books/:id", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const body = request.body as { title?: string; author?: string | null };
    let title: string | undefined;
    if (body.title !== undefined) {
      title = body.title.trim();
      if (!title) {
        return reply.code(400).send({ error: "Missing title" });
      }
    }
    const updated = updateBookRecord(request.user.id, id, title, body.author);
    if (!updated) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send(updated);
  });

  app.delete("/api/books/:id", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const removed = await removeBook(request.user.id, id);
    if (!removed) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.send({ ok: true });
  });

  app.post("/api/books/upload", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!env.allowUpload) {
      return reply.code(403).send({ error: "Uploads disabled" });
    }
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "Missing file" });
    }
    const ext = normalizeExtension(data.filename);
    const format = formatFromExtension(ext);
    if (!format) {
      return reply.code(400).send({ error: "Unsupported file format" });
    }

    const record = await uploadBook(request.user.id, data, format, ext);
    return reply.send(record);
  });

  app.get("/api/books/:id/file", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const result = await getBookFileStream(request.user.id, id, request.headers.range);
    if (!result) {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.header("Accept-Ranges", "bytes");
    if (result.range) {
      reply.code(206);
      reply.header("Content-Type", result.mime);
      reply.header("Content-Range", `bytes ${result.range.start}-${result.range.end}/${result.stat.size}`);
      reply.header("Content-Length", result.range.chunkSize.toString());
      return reply.send(result.stream);
    }
    reply.header("Content-Type", result.mime);
    reply.header("Content-Length", result.stat.size.toString());
    return reply.send(result.stream);
  });

  app.get("/api/books/:id/cover", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const id = (request.params as { id: string }).id;
    const result = getBookCoverStream(request.user.id, id);
    if (!result) {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.header("Content-Type", result.mime);
    return reply.send(result.stream);
  });
}
