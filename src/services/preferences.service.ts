import { ApiError } from '../api/errors';
import type { ChannelCode, EffectivePreference } from '../domain/types';
import { logger } from '../logger';
import { NotificationMetadataRepository } from '../repositories/notification-metadata.repository';
import { PreferencesRepository } from '../repositories/preferences.repository';
import { QuietHoursRepository } from '../repositories/quiet-hours.repository';
import { UsersRepository } from '../repositories/users.repository';

type EnabledPartMeta = {
  operation: 'created' | 'updated' | 'noop';
  changed: boolean;
};

type QuietHoursPartMeta = {
  operation: 'updated' | 'noop';
  changed: boolean;
};

export type UpdatePreferenceResult = {
  data: EffectivePreference;
  meta: {
    operation: 'created' | 'updated' | 'noop';
    changed: boolean;
    parts: {
      enabled?: EnabledPartMeta;
      quietHours?: QuietHoursPartMeta;
    };
  };
};

export type PreferencesServiceDeps = {
  usersRepository?: Pick<UsersRepository, 'findById'>;
  metadataRepository?: Pick<
    NotificationMetadataRepository,
    'findChannelByCode' | 'findNotificationTypeByCode' | 'listNotificationTypeChannels'
  >;
  preferencesRepository?: Pick<PreferencesRepository, 'findUserPreference' | 'findActiveDefaultPreference' | 'upsertUserPreference'>;
  quietHoursRepository?: Pick<QuietHoursRepository, 'findUserQuietHours' | 'findActiveDefaultQuietHours' | 'replaceUserQuietHours'>;
};

export class PreferencesService {
  private readonly usersRepository: Pick<UsersRepository, 'findById'>;
  private readonly metadataRepository: Pick<
    NotificationMetadataRepository,
    'findChannelByCode' | 'findNotificationTypeByCode' | 'listNotificationTypeChannels'
  >;
  private readonly preferencesRepository: Pick<
    PreferencesRepository,
    'findUserPreference' | 'findActiveDefaultPreference' | 'upsertUserPreference'
  >;
  private readonly quietHoursRepository: Pick<
    QuietHoursRepository,
    'findUserQuietHours' | 'findActiveDefaultQuietHours' | 'replaceUserQuietHours'
  >;

  constructor(deps: PreferencesServiceDeps = {}) {
    this.usersRepository = deps.usersRepository ?? new UsersRepository();
    this.metadataRepository = deps.metadataRepository ?? new NotificationMetadataRepository();
    this.preferencesRepository = deps.preferencesRepository ?? new PreferencesRepository();
    this.quietHoursRepository = deps.quietHoursRepository ?? new QuietHoursRepository();
  }

  async getEffectivePreference(input: {
    userId: string;
    notificationTypeCode: string;
    channelCode: string;
  }): Promise<EffectivePreference> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user) {
      throw new ApiError(404, 'unknown_user', `Unknown user: ${input.userId}`);
    }

    const channel = await this.metadataRepository.findChannelByCode(input.channelCode);
    if (!channel) {
      throw new ApiError(404, 'unknown_channel', `Unknown channel: ${input.channelCode}`);
    }

    const notificationType = await this.metadataRepository.findNotificationTypeByCode(input.notificationTypeCode);
    if (!notificationType) {
      throw new ApiError(404, 'unknown_notification_type', `Unknown notification type: ${input.notificationTypeCode}`);
    }

    const userPref = await this.preferencesRepository.findUserPreference({
      userId: user.id,
      notificationTypeId: notificationType.id,
      channelId: channel.id,
    });

    let enabled: boolean;
    let enabledSource: 'user' | 'default';

    if (userPref) {
      enabled = userPref.enabled;
      enabledSource = 'user';
    } else {
      const defaultPref = await this.preferencesRepository.findActiveDefaultPreference({
        regionId: user.regionId,
        notificationTypeId: notificationType.id,
        categoryId: notificationType.categoryId,
        channelId: channel.id,
      });
      enabled = defaultPref?.enabled ?? false;
      enabledSource = 'default';
    }

    const userQuietHours = await this.quietHoursRepository.findUserQuietHours({
      userId: user.id,
      notificationTypeId: notificationType.id,
      categoryId: notificationType.categoryId,
      channelId: channel.id,
    });

    let quietHours = userQuietHours;
    let quietHoursSource: 'user' | 'default' = 'user';

    if (quietHours.length === 0) {
      quietHours = await this.quietHoursRepository.findActiveDefaultQuietHours({
        regionId: user.regionId,
        notificationTypeId: notificationType.id,
        categoryId: notificationType.categoryId,
        channelId: channel.id,
      });
      quietHoursSource = 'default';
    }

    return {
      userId: user.id,
      notificationTypeCode: notificationType.code,
      notificationCategoryCode: notificationType.categoryCode,
      channelCode: channel.code as ChannelCode,
      enabled,
      quietHours: quietHours.map((window) => ({
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      })),
      timezone: user.timezone,
      source: {
        enabled: enabledSource,
        quietHours: quietHoursSource,
      },
    };
  }

  async listEffectivePreferences(input: { userId: string }): Promise<EffectivePreference[]> {
    const pairs = await this.metadataRepository.listNotificationTypeChannels();

    const preferences = await Promise.all(
      pairs.map((pair) =>
        this.getEffectivePreference({
          userId: input.userId,
          notificationTypeCode: pair.notificationTypeCode,
          channelCode: pair.channelCode,
        }),
      ),
    );

    return preferences;
  }

  async updateUserPreference(input: {
    userId: string;
    notificationTypeCode: string;
    channelCode: string;
    enabled?: boolean;
    quietHours?: Array<{ startMinute: number; endMinute: number }>;
  }): Promise<UpdatePreferenceResult> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user) {
      throw new ApiError(404, 'unknown_user', `Unknown user: ${input.userId}`);
    }

    const channel = await this.metadataRepository.findChannelByCode(input.channelCode);
    if (!channel) {
      throw new ApiError(404, 'unknown_channel', `Unknown channel: ${input.channelCode}`);
    }

    const notificationType = await this.metadataRepository.findNotificationTypeByCode(input.notificationTypeCode);
    if (!notificationType) {
      throw new ApiError(404, 'unknown_notification_type', `Unknown notification type: ${input.notificationTypeCode}`);
    }

    let enabledMeta: EnabledPartMeta | undefined;
    let quietHoursMeta: QuietHoursPartMeta | undefined;

    if (input.enabled !== undefined) {
      const result = await this.preferencesRepository.upsertUserPreference({
        userId: user.id,
        notificationTypeId: notificationType.id,
        channelId: channel.id,
        enabled: input.enabled,
      });
      enabledMeta = { operation: result.operation, changed: result.changed };
    }

    if (input.quietHours !== undefined) {
      const result = await this.quietHoursRepository.replaceUserQuietHours({
        userId: user.id,
        notificationTypeId: notificationType.id,
        channelId: channel.id,
        windows: input.quietHours,
      });
      quietHoursMeta = { operation: result.operation, changed: result.changed };
    }

    const data = await this.getEffectivePreference({
      userId: user.id,
      notificationTypeCode: notificationType.code,
      channelCode: channel.code,
    });

    const changed = Boolean(enabledMeta?.changed || quietHoursMeta?.changed);

    let operation: 'created' | 'updated' | 'noop' = 'noop';
    if (enabledMeta?.operation === 'updated' || quietHoursMeta?.operation === 'updated') {
      operation = 'updated';
    } else if (enabledMeta?.operation === 'created') {
      operation = 'created';
    }

    const response: UpdatePreferenceResult = {
      data,
      meta: {
        operation,
        changed,
        parts: {
          ...(enabledMeta ? { enabled: enabledMeta } : {}),
          ...(quietHoursMeta ? { quietHours: quietHoursMeta } : {}),
        },
      },
    };

    logger.info(
      {
        userId: user.id,
        notificationTypeCode: notificationType.code,
        channelCode: channel.code,
        changed: response.meta.changed,
        operation: response.meta.operation,
        parts: response.meta.parts,
      },
      'Preference update processed',
    );

    return response;
  }
}
