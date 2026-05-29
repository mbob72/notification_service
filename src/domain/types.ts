export type NotificationCategoryCode = 'transactional' | 'marketing';

export type ChannelCode = 'email' | 'push' | 'sms' | 'messenger';

export type Decision = 'allow' | 'deny';

export type EvaluationReason =
  | 'allowed'
  | 'blocked_by_global_policy'
  | 'disabled_by_user'
  | 'disabled_by_default'
  | 'blocked_by_quiet_hours';

export type QuietHoursWindow = {
  startMinute: number;
  endMinute: number;
};

export type EffectivePreference = {
  userId: string;
  notificationTypeCode: string;
  notificationCategoryCode: NotificationCategoryCode;
  channelCode: ChannelCode;
  enabled: boolean;
  quietHours: QuietHoursWindow[];
  timezone: string;
  source: {
    enabled: 'user' | 'default';
    quietHours: 'user' | 'default';
  };
};
