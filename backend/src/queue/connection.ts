import IORedis from "ioredis";

// BullMQ requires this to be null so it can manage blocking commands itself
export const redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
