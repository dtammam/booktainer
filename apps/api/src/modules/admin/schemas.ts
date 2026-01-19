import { z } from "zod";

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  isAdmin: z.boolean().optional()
});
