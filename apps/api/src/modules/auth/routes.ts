import type { FastifyInstance } from "fastify";
import * as cookie from "cookie";
import { env } from "../../env";
import { authLoginSchema } from "./schemas";
import {
  authenticateUser,
  extractSessionId,
  getSessionCookieName,
  getSessionTtlSeconds,
  revokeSession
} from "./service";

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = authLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    try {
      const result = await authenticateUser({
        email: parsed.data.email,
        password: parsed.data.password,
        request
      });
      if (!result) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }
      const cookieValue = cookie.serialize(getSessionCookieName(), result.sessionCookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.sessionCookieSecure,
        path: "/",
        maxAge: getSessionTtlSeconds()
      });
      reply.header("Set-Cookie", cookieValue);
      return reply.send({ user: result.user });
    } catch (error) {
      return reply.code(500).send({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = extractSessionId(request.headers.cookie);
    if (sessionId) {
      revokeSession(sessionId);
    }
    const cookieValue = cookie.serialize(getSessionCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: env.sessionCookieSecure,
      path: "/",
      maxAge: 0
    });
    reply.header("Set-Cookie", cookieValue);
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return reply.send({ user: request.user });
  });
}
