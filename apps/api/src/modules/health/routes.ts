import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ status: "ok" }));
}
