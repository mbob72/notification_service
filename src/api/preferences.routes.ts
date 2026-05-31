import { Router } from 'express';
import { asyncHandler } from './errors';
import { getPreferenceQuerySchema, updatePreferenceBodySchema, userIdParamSchema } from './validation';
import { PreferencesService } from '../services/preferences.service';

export type PreferencesRouterDeps = {
  preferencesService?: Pick<PreferencesService, 'getEffectivePreference' | 'listEffectivePreferences' | 'updateUserPreference'>;
};

export function createPreferencesRouter(deps: PreferencesRouterDeps = {}) {
  const preferencesService = deps.preferencesService ?? new PreferencesService();
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { userId } = userIdParamSchema.parse(req.params);
      const query = getPreferenceQuerySchema.parse(req.query);

      const data =
        query.notificationTypeCode && query.channelCode
          ? await preferencesService.getEffectivePreference({
              userId,
              notificationTypeCode: query.notificationTypeCode,
              channelCode: query.channelCode,
            })
          : await preferencesService.listEffectivePreferences({ userId });

      res.json({ data });
    }),
  );

  router.post(
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

  return router;
}

export const preferencesRouter = createPreferencesRouter();
