import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { vetRouter } from './routes/vet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// API routes
app.use('/api', vetRouter);

// Production: serve static files
if (config.port === parseInt(process.env.PORT ?? '3000', 10) && process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
