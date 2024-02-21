import axios from "axios";
import opentelemetry from "@opentelemetry/api";
import { logger } from "./loggers.js";

export const predictAge = async ({ name }) => {
  const span = opentelemetry.trace.getActiveSpan();
  logger.info("predict age", { name, ...span.attributes });

  const { data, status } = await axios.get(
    `https://api.agify.io?name=${name}`,
    {
      headers: {
        // We could look at using context or baggage API for this instead.
        "x-request-id": span?.attributes?.["x-request-id"],
      },
    }
  );

  if (status >= 400) {
    logger.error({
      error: {
        type: "prediction_api_error",
        message: "Failed to retrieve ",
      },
    });
    return;
  }

  logger.info("prediction success", {
    "predict.name": data.name,
    "predict.age": data.age,
  });

  return data.age;
};
