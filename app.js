import express from 'express';

const PORT = parseInt(process.env.PORT || '8080');
const app = express();

import { predictAge } from './service.js';

// Routes
app.get('/predict', async (req, res) => {
  const name = req.query.name;

  if(!name) {
    return res.status(400);
  }

  const age = await predictAge({ name });
  res.json({ age });

});

app.listen(PORT, () => {
  console.log(`Listening for requests on http://localhost:${PORT}`);
});