import { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const redis = new Redis(env.REDIS_URL);

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));

export default redis;
