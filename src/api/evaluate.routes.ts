import { Router } from 'express';
import { asyncHandler } from './errors';
import { evaluateBodySchema } from './validation';
import { EvaluationService } from '../services/evaluation.service';

const evaluationService = new EvaluationService();

export const evaluateRouter = Router();

evaluateRouter.post(
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
