import { setupLogger } from "@mattrglobal/platform-logging";
import config from "./config.js";

export const { logger, logRequestHandler, logErrorHandler } = setupLogger({
  service: config.service,
  metadata: {
    "k8ns.namespace": config.namespace,
    "version": config.version
  }
});
