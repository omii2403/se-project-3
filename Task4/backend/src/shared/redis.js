const IORedis = require("ioredis");
const { redis } = require("./config");

const redisConnection = new IORedis({
  host: redis.host,
  port: redis.port,
  family: 4,
  connectTimeout: 2000,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 2) {
      return null;
    }

    return Math.min(times * 300, 600);
  }
});

redisConnection.on("error", () => {
  // Errors are handled by queue or worker call sites.
});

module.exports = redisConnection;
