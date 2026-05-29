import { ApiError } from '../api/errors';
import { isMinuteInsideQuietHours, toLocalMinuteOfDay } from '../domain/quiet-hours';
import type { Decision, EvaluationReason } from '../domain/types';
import { GlobalPoliciesRepository } from '../repositories/global-policies.repository';
import { NotificationMetadataRepository } from '../repositories/notification-metadata.repository';
import { UsersRepository } from '../repositories/users.repository';
import { PreferencesService } from './preferences.service';

export class EvaluationService {
  constructor(
    private readonly usersRepository = new UsersRepository(),
    private readonly metadataRepository = new NotificationMetadataRepository(),
    private readonly globalPoliciesRepository = new GlobalPoliciesRepository(),
    private readonly preferencesService = new PreferencesService(),
  ) {}

  async evaluate(input: {
    userId: string;
    notificationTypeCode: string;
    channelCode: string;
    regionCode?: string;
    datetime: string;
  }): Promise<{
    decision: Decision;
    reason: EvaluationReason;
  }> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user) {
      throw new ApiError(404, 'unknown_user', `Unknown user: ${input.userId}`);
    }

    if (input.regionCode && input.regionCode !== user.regionCode) {
      throw new ApiError(
        400,
        'region_mismatch',
        `Region mismatch: user region is ${user.regionCode}, request region is ${input.regionCode}`,
      );
    }

    const channel = await this.metadataRepository.findChannelByCode(input.channelCode);
    if (!channel) {
      throw new ApiError(404, 'unknown_channel', `Unknown channel: ${input.channelCode}`);
    }

    const notificationType = await this.metadataRepository.findNotificationTypeByCode(input.notificationTypeCode);
    if (!notificationType) {
      throw new ApiError(404, 'unknown_notification_type', `Unknown notification type: ${input.notificationTypeCode}`);
    }

    const policy = await this.globalPoliciesRepository.findMatchingActivePolicy({
      regionId: user.regionId,
      notificationTypeId: notificationType.id,
      categoryId: notificationType.categoryId,
      channelId: channel.id,
    });

    if (policy && policy.deliveryAllowed === false) {
      return { decision: 'deny', reason: 'blocked_by_global_policy' };
    }

    const effective = await this.preferencesService.getEffectivePreference({
      userId: input.userId,
      notificationTypeCode: input.notificationTypeCode,
      channelCode: input.channelCode,
    });

    if (!effective.enabled) {
      return {
        decision: 'deny',
        reason: effective.source.enabled === 'user' ? 'disabled_by_user' : 'disabled_by_default',
      };
    }

    const minute = toLocalMinuteOfDay(input.datetime, user.timezone);
    const insideQuietHours = effective.quietHours.some((window) => isMinuteInsideQuietHours(minute, window));

    if (insideQuietHours && effective.notificationCategoryCode !== 'transactional') {
      return { decision: 'deny', reason: 'blocked_by_quiet_hours' };
    }

    return { decision: 'allow', reason: 'allowed' };
  }
}
