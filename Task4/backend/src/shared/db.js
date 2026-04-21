const mongoose = require("mongoose");
const { mongoUri } = require("./config");
const logger = require("./logger");

async function connectDb() {
  await mongoose.connect(mongoUri);
  logger.info("mongo.connected", {
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  });
}

module.exports = {
  connectDb
};
