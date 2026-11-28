import "dotenv/config";

// Runs before any app module is imported, so env.ts, prisma and redis all pick these up.
// Tests get their own database (<name>_test) and Redis db 15: they never touch dev data.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set to run tests");

const db = new URL(process.env.DATABASE_URL);
if (!db.pathname.endsWith("_test")) db.pathname += "_test";
process.env.DATABASE_URL = db.toString();

const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
redis.pathname = "/15";
process.env.REDIS_URL = redis.toString();

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? "silent";
