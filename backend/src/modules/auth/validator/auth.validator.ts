import { z } from "zod";
import { SystemRoleName } from "../../../constant/role.js";

// Roles anyone may pick at sign-up. ADMIN is deliberately absent: it's never self-assigned.
export const SIGNUP_ROLES = [SystemRoleName.JOB_SEEKER, SystemRoleName.RECRUITER] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const loginODT = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerODT = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string(),
  role: z.enum(SIGNUP_ROLES).default(SystemRoleName.JOB_SEEKER),
});

export const updateProfileODT = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginODT>;
export type RegisterInput = z.infer<typeof registerODT>;
export type UpdateProfileInput = z.infer<typeof updateProfileODT>;
