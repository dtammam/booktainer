import crypto from "node:crypto";
import argon2 from "argon2";
import * as cookie from "cookie";
import type { FastifyRequest } from "fastify";
import { env } from "../../env";
import {
  countUsers,
  deleteExpiredSessions,
  deleteSession,
  getSessionWithUser,
  getUserByEmail,
  insertSession,
  insertUser,
  toAuthUser
} from "./repo";
import type { AuthUser, DbUser } from "./types";

const SESSION_COOKIE_NAME = "booktainer_session";

function toBase64Url(input: Buffer) {
  return input.toString("base64url");
}

function signSessionId(sessionId: string) {
  const hmac = crypto.createHmac("sha256", env.sessionSecret);
  hmac.update(sessionId);
  return toBase64Url(hmac.digest());
}

function parseSessionCookie(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [sessionId, signature] = parts;
  const expected = signSessionId(sessionId);
  if (signature !== expected) {
    return null;
  }
  return sessionId;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionTtlSeconds() {
  return env.sessionTtlDays * 24 * 60 * 60;
}

export async function bootstrapAdmin() {
  const existing = countUsers();
  if (existing > 0) {
    return;
  }
  if (!env.adminEmail || !env.adminPassword) {
    throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD for initial admin bootstrap.");
  }
  await createUser({
    email: env.adminEmail,
    password: env.adminPassword,
    isAdmin: true
  });
}

export async function createUser(input: { email: string; password: string; isAdmin: boolean }) {
  const email = input.email.trim().toLowerCase();
  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error("User already exists.");
  }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user: DbUser = {
    id: crypto.randomUUID(),
    email,
    password_hash: passwordHash,
    is_admin: input.isAdmin ? 1 : 0,
    created_at: Date.now()
  };
  insertUser(user);
  return toAuthUser(user);
}

export async function authenticateUser(input: { email: string; password: string; request: FastifyRequest }) {
  if (!env.sessionSecret) {
    throw new Error("SESSION_SECRET is required.");
  }
  const email = input.email.trim().toLowerCase();
  const record = getUserByEmail(email);
  if (!record) {
    return null;
  }
  const ok = await argon2.verify(record.password_hash, input.password, { type: argon2.argon2id });
  if (!ok) {
    return null;
  }
  const now = Date.now();
  const ttlSeconds = getSessionTtlSeconds();
  const sessionId = crypto.randomUUID();
  insertSession({
    id: sessionId,
    user_id: record.id,
    created_at: now,
    expires_at: now + ttlSeconds * 1000,
    ip: input.request.ip,
    user_agent: input.request.headers["user-agent"] || null
  });
  const signed = `${sessionId}.${signSessionId(sessionId)}`;
  return {
    user: toAuthUser(record),
    sessionId,
    sessionCookie: signed
  };
}

export async function resolveRequestUser(request: FastifyRequest): Promise<AuthUser | null> {
  if (!env.sessionSecret) {
    return null;
  }
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookie.parse(cookieHeader);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  const sessionId = parseSessionCookie(sessionCookie);
  if (!sessionId) {
    return null;
  }
  const result = getSessionWithUser(sessionId);
  if (!result) {
    return null;
  }
  if (result.session.expires_at <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }
  deleteExpiredSessions(Date.now());
  return result.user;
}

export function extractSessionId(cookieHeader: string | undefined) {
  if (!cookieHeader || !env.sessionSecret) {
    return null;
  }
  const cookies = cookie.parse(cookieHeader);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  return parseSessionCookie(sessionCookie);
}

export function revokeSession(sessionId: string | null) {
  if (!sessionId) {
    return;
  }
  deleteSession(sessionId);
}
