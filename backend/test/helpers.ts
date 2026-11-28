import request from "supertest";
import { afterAll } from "vitest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import redis from "../src/config/redis";
import type { SignupRole } from "../src/modules/auth/validator/auth.validator";

export const PASSWORD = "Password123!";

// Wipes all data except roles (seeded once in global-setup). CASCADE follows every FK,
// so users/companies/skills reach profiles, jobs, swipes, matches, messages and embeddings.
export async function resetDb() {
  await prisma.$executeRawUnsafe("TRUNCATE users, companies, skills CASCADE");
  await redis.flushdb();
}

// Registers a user and returns an agent that carries their auth cookies.
export async function signedInAs(role: SignupRole, email = `${role.toLowerCase()}@test.dev`) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ email, password: PASSWORD, fullName: "Test User", role })
    .expect(201);
  return agent;
}

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
