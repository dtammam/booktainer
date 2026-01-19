export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  is_admin: number;
  created_at: number;
}

export interface DbSession {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  ip: string | null;
  user_agent: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
