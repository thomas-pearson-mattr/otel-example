import express from 'express';
import 'express-async-errors';
import { logger, logRequestHandler, logErrorHandler } from "./loggers.js"
import { predictAge } from './service.js';

const app = express();

app.use(logRequestHandler);

// Routes
app.get('/predict', async (req, res) => {
  logger.info("hello");
  const name = req.query.name;

  if(!name) {
    return res.status(400);
  }

  const age = await predictAge({ name });
  res.json({ age });

});

app.get('/error', () => { throw new Error("Whoops something went wrong!") })

app.use((error, req, res, next) => {
  logger.error("An unexpected error occurred", { error })
  return res.status(500).json({ error: "Internal Server Error" });
});

app.use(logErrorHandler);

export default app;