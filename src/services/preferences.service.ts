import type { ChannelCode, EffectivePreference } from '../domain/types';
import { NotificationMetadataRepository } from '../repositories/notification-metadata.repository';
import { PreferencesRepository } from '../repositories/preferences.repository';
import { QuietHoursRepository } from '../repositories/quiet-hours.repository';
import { UsersRepository } from '../repositories/users.repository';

export class PreferencesService {
  constructor(
    private readonly usersRepository = new UsersRepository(),
    private readonly metadataRepository = new NotificationMetadataRepository(),
    private readonly preferencesRepository = new PreferencesRepository(),
    private readonly quietHoursRepository = new QuietHoursRepository(),
  ) {}

  async getEffectivePreference(input: {
    userId: string;
    notificationTypeCode: string;
    channelCode: string;
  }): Promise<EffectivePreference> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user) {
      throw new Error(`Unknown user: ${input.userId}`);
    }

    const channel = await this.metadataRepository.findChannelByCode(input.channelCode);
    if (!channel) {
      throw new Error(`Unknown channel: ${input.channelCode}`);
    }

    const notificationType = await this.metadataRepository.findNotificationTypeByCode(input.notificationTypeCode);
    if (!notificationType) {
      throw new Error(`Unknown notification type: ${input.notificationTypeCode}`);
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
}
