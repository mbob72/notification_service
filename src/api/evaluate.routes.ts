import { Router } from 'express';
import { asyncHandler } from './errors';
import { evaluateBodySchema } from './validation';
import { EvaluationService } from '../services/evaluation.service';

export type EvaluateRouterDeps = {
  evaluationService?: Pick<EvaluationService, 'evaluate'>;
};

export function createEvaluateRouter(deps: EvaluateRouterDeps = {}) {
  const evaluationService = deps.evaluationService ?? new EvaluationService();
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = evaluateBodySchema.parse(req.body);
      const data = await evaluationService.evaluate({
        userId: body.userId,
        notificationTypeCode: body.notificationTypeCode,
        channelCode: body.channelCode,
        datetime: body.datetime,
        ...(body.regionCode !== undefined ? { regionCode: body.regionCode } : {}),
      });
      res.json({ data });
    }),
  );

  return router;
}

export const evaluateRouter = createEvaluateRouter();
