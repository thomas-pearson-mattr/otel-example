import config from './config.js';
import { logger } from "./loggers.js";
import app from "./app.js";

const server = app.listen(config.port, () => {
  logger.info(`Listening for requests on http://localhost:${config.port}`);
});

const gracefulShutdown = () => {
  logger.info("Shuting down service...");

  server.close((error) => {
    logger.info("Server and ending process...", { error });
    process.exit();
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
