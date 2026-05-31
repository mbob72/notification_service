import express from 'express';
import { errorHandler } from './errors';
import { createEvaluateRouter, type EvaluateRouterDeps } from './api/evaluate.routes';
import { createPreferencesRouter, type PreferencesRouterDeps } from './api/preferences.routes';

export type AppDeps = EvaluateRouterDeps & PreferencesRouterDeps;

export function createApp(deps: AppDeps = {}) {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const preferencesRouterDeps = deps.preferencesService ? { preferencesService: deps.preferencesService } : {};
  const evaluateRouterDeps = deps.evaluationService ? { evaluationService: deps.evaluationService } : {};

  app.use('/users/:userId/preferences', createPreferencesRouter(preferencesRouterDeps));
  app.use('/evaluate', createEvaluateRouter(evaluateRouterDeps));

  app.use(errorHandler);

  return app;
}
