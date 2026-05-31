import { Router } from 'express';
import { asyncHandler } from './errors';
import { getPreferenceQuerySchema, updatePreferenceBodySchema, userIdParamSchema } from './validation';
import { PreferencesService } from '../services/preferences.service';

const preferencesService = new PreferencesService();

export const preferencesRouter = Router({ mergeParams: true });

preferencesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const query = getPreferenceQuerySchema.parse(req.query);

    const data = await preferencesService.getEffectivePreference({
      userId,
      notificationTypeCode: query.notificationTypeCode,
      channelCode: query.channelCode,
    });

    res.json({ data });
  }),
);

preferencesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const body = updatePreferenceBodySchema.parse(req.body);

    const result = await preferencesService.updateUserPreference({
      userId,
      notificationTypeCode: body.notificationTypeCode,
      channelCode: body.channelCode,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.quietHours !== undefined ? { quietHours: body.quietHours } : {}),
    });

    res.status(200).json(result);
  }),
);
