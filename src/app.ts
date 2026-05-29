import express from 'express';
import { errorHandler } from './api/errors';
import { evaluateRouter } from './api/evaluate.routes';
import { preferencesRouter } from './api/preferences.routes';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/users/:userId/preferences', preferencesRouter);
  app.use('/evaluate', evaluateRouter);

  app.use(errorHandler);

  return app;
}
