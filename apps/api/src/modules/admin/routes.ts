import type { FastifyInstance } from "fastify";
import { adminCreateUserSchema } from "./schemas";
import { createAdminUser } from "./service";

export function registerAdminRoutes(app: FastifyInstance) {
  app.post("/api/admin/users", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!request.user.isAdmin) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const parsed = adminCreateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    try {
      const user = await createAdminUser({
        email: parsed.data.email,
        password: parsed.data.password,
        isAdmin: parsed.data.isAdmin ?? false
      });
      return reply.code(201).send({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      if (message.includes("already exists")) {
        return reply.code(409).send({ error: "User already exists" });
      }
      return reply.code(500).send({ error: "Failed to create user" });
    }
  });
}
