import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { SystemRoleName } from "../src/constant/role";
import { PASSWORD, resetDb, signedInAs } from "./helpers";

const register = (body: Record<string, unknown>) =>
  request(app)
    .post("/api/auth/register")
    .send({ password: PASSWORD, fullName: "Test User", ...body });

type UserBody = { data: { user: { email: string; role: { name: string } } } };
const userOf = (res: request.Response) => (res.body as UserBody).data.user;

const findUser = (email: string) =>
  prisma.user.findUnique({
    where: { email },
    include: { role: true, candidate: true, recruiter: true },
  });

// the value of one cookie from a response's Set-Cookie headers
const cookie = (res: request.Response, name: string) => {
  const header = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  return header.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
};

beforeEach(resetDb);

describe("POST /api/auth/register", () => {
  it("defaults to JOB_SEEKER and creates an empty candidate profile", async () => {
    const res = await register({ email: "seeker@test.dev" });

    expect(res.status).toBe(201);
    expect(userOf(res).role.name).toBe("JOB_SEEKER");
    const user = await findUser("seeker@test.dev");
    expect(user?.candidate).not.toBeNull();
  });

  it("creates a RECRUITER with no candidate or recruiter profile yet", async () => {
    const res = await register({ email: "rec@test.dev", role: "RECRUITER" });

    expect(res.status).toBe(201);
    expect(userOf(res).role.name).toBe("RECRUITER");
    const user = await findUser("rec@test.dev");
    expect(user?.candidate).toBeNull();
    expect(user?.recruiter).toBeNull(); // created with the company (T06)
  });

  it("never lets anyone sign up as ADMIN", async () => {
    const res = await register({ email: "evil@test.dev", role: "ADMIN" });

    expect(res.status).toBe(422);
    expect(await findUser("evil@test.dev")).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    await register({ email: "dup@test.dev" }).expect(201);
    const res = await register({ email: "dup@test.dev", role: "RECRUITER" });

    expect(res.status).toBe(409);
  });

  it("stores a bcrypt hash, never the plain password", async () => {
    await register({ email: "hash@test.dev" }).expect(201);
    const user = await findUser("hash@test.dev");

    expect(user?.password).not.toBe(PASSWORD);
    expect(user?.password).toMatch(/^\$2[aby]\$/);
  });
});

describe("login, me, refresh, logout", () => {
  it("logs in, reads /me, and rejects a wrong password", async () => {
    await register({ email: "login@test.dev" }).expect(201);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.dev", password: "wrong-password" })
      .expect(401);

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "login@test.dev", password: PASSWORD })
      .expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(userOf(me).email).toBe("login@test.dev");
  });

  it("rejects /me without a token", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("rotates the refresh token: an old one can't be reused", async () => {
    const res = await register({ email: "rotate@test.dev" }).expect(201);
    const oldRefresh = cookie(res, "refreshToken")!;

    await request(app).post("/api/auth/refresh-token").set("Cookie", oldRefresh).expect(200);
    await request(app).post("/api/auth/refresh-token").set("Cookie", oldRefresh).expect(401);
  });

  it("logout revokes the refresh token", async () => {
    const agent = await signedInAs(SystemRoleName.JOB_SEEKER);
    await agent.post("/api/auth/logout").expect(200);

    expect(await prisma.refreshToken.count()).toBe(0);
  });
});
