import { ApiError } from '../errors';
import { isMinuteInsideQuietHours, toLocalMinuteOfDay } from '../domain/quiet-hours';
import type { Decision, EvaluationReason } from '../domain/types';
import { logger } from '../logger';
import { GlobalPoliciesRepository } from '../repositories/global-policies.repository';
import { NotificationMetadataRepository } from '../repositories/notification-metadata.repository';
import { UsersRepository } from '../repositories/users.repository';
import { PreferencesService, type PreferencesServiceDeps } from './preferences.service';

export type EvaluationServiceDeps = {
  usersRepository?: Pick<UsersRepository, 'findById'>;
  metadataRepository?: Pick<NotificationMetadataRepository, 'findChannelByCode' | 'findNotificationTypeByCode'>;
  globalPoliciesRepository?: Pick<GlobalPoliciesRepository, 'findMatchingActivePolicy'>;
  preferencesService?: Pick<PreferencesService, 'getEffectivePreference'>;
  preferencesServiceDeps?: PreferencesServiceDeps;
};

export class EvaluationService {
  private readonly usersRepository: Pick<UsersRepository, 'findById'>;
  private readonly metadataRepository: Pick<NotificationMetadataRepository, 'findChannelByCode' | 'findNotificationTypeByCode'>;
  private readonly globalPoliciesRepository: Pick<GlobalPoliciesRepository, 'findMatchingActivePolicy'>;
  private readonly preferencesService: Pick<PreferencesService, 'getEffectivePreference'>;

  constructor(deps: EvaluationServiceDeps = {}) {
    this.usersRepository = deps.usersRepository ?? new UsersRepository();
    this.metadataRepository = deps.metadataRepository ?? new NotificationMetadataRepository();
    this.globalPoliciesRepository = deps.globalPoliciesRepository ?? new GlobalPoliciesRepository();
    this.preferencesService = deps.preferencesService ?? new PreferencesService(deps.preferencesServiceDeps);
  }

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

    const logAndReturn = (decision: Decision, reason: EvaluationReason) => {
      logger.info(
        {
          userId: user.id,
          notificationTypeCode: notificationType.code,
          channelCode: channel.code,
          regionCode: user.regionCode,
          decision,
          reason,
        },
        'Notification delivery evaluated',
      );
      return { decision, reason };
    };

    const policy = await this.globalPoliciesRepository.findMatchingActivePolicy({
      regionId: user.regionId,
      notificationTypeId: notificationType.id,
      categoryId: notificationType.categoryId,
      channelId: channel.id,
    });

    if (policy && policy.deliveryAllowed === false) {
      return logAndReturn('deny', 'blocked_by_global_policy');
    }

    const effective = await this.preferencesService.getEffectivePreference({
      userId: input.userId,
      notificationTypeCode: input.notificationTypeCode,
      channelCode: input.channelCode,
    });

    if (!effective.enabled) {
      return logAndReturn('deny', effective.source.enabled === 'user' ? 'disabled_by_user' : 'disabled_by_default');
    }

    const minute = toLocalMinuteOfDay(input.datetime, user.timezone);
    const insideQuietHours = effective.quietHours.some((window) => isMinuteInsideQuietHours(minute, window));

    if (insideQuietHours && effective.notificationCategoryCode !== 'transactional') {
      return logAndReturn('deny', 'blocked_by_quiet_hours');
    }

    return logAndReturn('allow', 'allowed');
  }
}
