import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import authMiddleware from "../src/middleware/auth/authenticate.middleware";
import { authorize } from "../src/middleware/auth/rbac.middleware";
import { globalErrorHandler } from "../src/middleware/globalErrorHandler";
import { prisma } from "../src/lib/prisma";
import redis from "../src/config/redis";
import { seedRoles } from "../src/seeding/role.seed";
import { SystemRoleName } from "../src/constant/role";
import { getUserPermissions } from "../src/modules/auth/services/permission.service";
import type { SignupRole } from "../src/modules/auth/validator/auth.validator";
import { PASSWORD, resetDb } from "./helpers";

// No real route uses authorize() yet, so the real middleware is mounted on probe routes.
const probe = express();
probe.use(cookieParser());
probe.get("/job-create", authMiddleware(), authorize("job", "create"), (_req, res) => {
  res.json({ ok: true });
});
probe.get("/resume-create", authMiddleware(), authorize("resume", "create"), (_req, res) => {
  res.json({ ok: true });
});
probe.use(globalErrorHandler);

// sign up through the real API and return the access-token cookie
async function accessCookieFor(role: SignupRole) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: `${role.toLowerCase()}@test.dev`, password: PASSWORD, fullName: "T", role })
    .expect(201);
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  return cookies.find((c) => c.startsWith("accessToken="))!.split(";")[0];
}

beforeEach(resetDb);

describe("role permissions (T01)", () => {
  it("lets a RECRUITER create jobs but not upload resumes", async () => {
    const cookie = await accessCookieFor(SystemRoleName.RECRUITER);

    await request(probe).get("/job-create").set("Cookie", cookie).expect(200);
    await request(probe).get("/resume-create").set("Cookie", cookie).expect(403);
  });

  it("lets a JOB_SEEKER upload resumes but not create jobs", async () => {
    const cookie = await accessCookieFor(SystemRoleName.JOB_SEEKER);

    await request(probe).get("/resume-create").set("Cookie", cookie).expect(200);
    await request(probe).get("/job-create").set("Cookie", cookie).expect(403);
  });

  it("rejects a request with no token", async () => {
    await request(probe).get("/job-create").expect(401);
  });

  it("re-seeding restores a system role's grants and clears cached permissions", async () => {
    await accessCookieFor(SystemRoleName.RECRUITER);
    const user = await prisma.user.findFirstOrThrow({ where: { email: "recruiter@test.dev" } });

    // simulate a role that drifted (e.g. edited by hand) and is already cached
    await prisma.role.update({
      where: { name: SystemRoleName.RECRUITER },
      data: { permissions: {} },
    });
    expect((await getUserPermissions(user.id))?.permissions).toEqual({});

    await seedRoles();

    expect(await redis.exists(`user:permissions:${user.id}`)).toBe(0);
    expect((await getUserPermissions(user.id))?.permissions.job).toContain("create");
  });
});
