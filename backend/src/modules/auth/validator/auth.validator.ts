import { z } from "zod";

export const loginODT = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerODT = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string(),
});

export const updateProfileODT = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginODT>;
export type RegisterInput = z.infer<typeof registerODT>;
export type UpdateProfileInput = z.infer<typeof updateProfileODT>;
