const app = require("./app");
const { connectDb } = require("./shared/db");
const { warmReadCaches } = require("./shared/cacheWarmup");
const { port } = require("./shared/config");
const logger = require("./shared/logger");

async function startServer() {
  await connectDb();
  await warmReadCaches();
  app.listen(port, () => {
    logger.info("api.started", { port });
  });
}

startServer().catch((err) => {
  logger.error("api.start_failed", { error: err.message });
  process.exit(1);
});
