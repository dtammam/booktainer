import { db } from "../../db";
import type { AuthUser, DbSession, DbUser } from "./types";

type SessionWithUserRow = {
  session_id: string;
  session_user_id: string;
  session_created_at: number;
  session_expires_at: number;
  session_ip: string | null;
  session_user_agent: string | null;
  user_id: string;
  user_email: string;
  user_is_admin: number;
};

function mapUser(row: DbUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin === 1
  };
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function getDefaultOwnerId(): string | null {
  const stmt = db.prepare(`
    SELECT id FROM (
      SELECT id, created_at, 0 as is_fallback
      FROM users
      WHERE is_admin = 1
      UNION ALL
      SELECT id, created_at, 1 as is_fallback
      FROM users
    )
    ORDER BY is_fallback, created_at
    LIMIT 1
  `);
  const row = stmt.get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function getUserByEmail(email: string): DbUser | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
  return stmt.get(email) as DbUser | undefined;
}

export function getUserById(id: string): DbUser | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
  return stmt.get(id) as DbUser | undefined;
}

export function insertUser(user: DbUser) {
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, is_admin, created_at)
    VALUES (@id, @email, @password_hash, @is_admin, @created_at)
  `);
  stmt.run(user);
}

export function insertSession(session: DbSession) {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent)
    VALUES (@id, @user_id, @created_at, @expires_at, @ip, @user_agent)
  `);
  stmt.run(session);
}

export function getSessionWithUser(sessionId: string) {
  const stmt = db.prepare(`
    SELECT
      s.id as session_id,
      s.user_id as session_user_id,
      s.created_at as session_created_at,
      s.expires_at as session_expires_at,
      s.ip as session_ip,
      s.user_agent as session_user_agent,
      u.id as user_id,
      u.email as user_email,
      u.is_admin as user_is_admin
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
    LIMIT 1
  `);
  const row = stmt.get(sessionId) as SessionWithUserRow | undefined;
  if (!row) {
    return null;
  }
  return {
    session: {
      id: row.session_id,
      user_id: row.session_user_id,
      created_at: row.session_created_at,
      expires_at: row.session_expires_at,
      ip: row.session_ip,
      user_agent: row.session_user_agent
    },
    user: {
      id: row.user_id,
      email: row.user_email,
      isAdmin: row.user_is_admin === 1
    } satisfies AuthUser
  };
}

export function deleteSession(sessionId: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteExpiredSessions(now: number) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

export function toAuthUser(row: DbUser): AuthUser {
  return mapUser(row);
}
