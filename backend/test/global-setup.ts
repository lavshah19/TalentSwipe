// setup-env must stay the first import: it points DATABASE_URL/REDIS_URL at the test
// database before prisma and redis (imported below) read them.
import "./setup-env";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { seedRoles } from "../src/seeding/role.seed";
import { prisma } from "../src/lib/prisma";
import redis from "../src/config/redis";

// Runs once before all test files: create the test database if needed, migrate it, seed roles.
export default async function globalSetup() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  if (!/^\w+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);

  // CREATE DATABASE has to run while connected to some other database
  const server = new URL(url);
  server.pathname = "/postgres";
  server.search = "";
  const client = new Client({ connectionString: server.toString() });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  execSync("npx prisma migrate deploy", { env: process.env, stdio: "pipe" });

  await redis.flushdb();
  await seedRoles();
  await prisma.$disconnect();
  await redis.quit();
}
