import { createUser } from "../auth/service";

export async function createAdminUser(input: { email: string; password: string; isAdmin: boolean }) {
  return createUser(input);
}
