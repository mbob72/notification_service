import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const regions = pgTable('regions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  timezone: text('timezone').notNull(),
  regionId: uuid('region_id').notNull().references(() => regions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationChannels = pgTable('notification_channels', {
  id: smallserial('id').primaryKey(),
  code: text('code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationCategories = pgTable('notification_categories', {
  id: smallserial('id').primaryKey(),
  code: text('code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTypes = pgTable('notification_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  categoryId: smallint('category_id').notNull().references(() => notificationCategories.id),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTypeChannels = pgTable(
  'notification_type_channels',
  {
    notificationTypeId: uuid('notification_type_id').notNull().references(() => notificationTypes.id, { onDelete: 'cascade' }),
    channelId: smallint('channel_id').notNull().references(() => notificationChannels.id),
    isEnabledByDefault: boolean('is_enabled_by_default').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.notificationTypeId, table.channelId] })],
);

export const defaultNotificationPreferenceVersions = pgTable(
  'default_notification_preference_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    regionId: uuid('region_id').notNull().references(() => regions.id),
    version: integer('version').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.regionId, table.version)],
);

export const defaultNotificationPreferences = pgTable('default_notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => defaultNotificationPreferenceVersions.id, { onDelete: 'cascade' }),
  categoryId: smallint('category_id').references(() => notificationCategories.id),
  notificationTypeId: uuid('notification_type_id').references(() => notificationTypes.id),
  channelId: smallint('channel_id').notNull().references(() => notificationChannels.id),
  enabled: boolean('enabled').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const defaultQuietHourVersions = pgTable(
  'default_quiet_hour_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    regionId: uuid('region_id').notNull().references(() => regions.id),
    version: integer('version').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.regionId, table.version)],
);

export const defaultQuietHours = pgTable('default_quiet_hours', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => defaultQuietHourVersions.id, { onDelete: 'cascade' }),
  categoryId: smallint('category_id').references(() => notificationCategories.id),
  notificationTypeId: uuid('notification_type_id').references(() => notificationTypes.id),
  channelId: smallint('channel_id').notNull().references(() => notificationChannels.id),
  startMinute: smallint('start_minute').notNull(),
  endMinute: smallint('end_minute').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userNotificationPreferences = pgTable(
  'user_notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    notificationTypeId: uuid('notification_type_id').notNull().references(() => notificationTypes.id),
    channelId: smallint('channel_id').notNull().references(() => notificationChannels.id),
    enabled: boolean('enabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.notificationTypeId, table.channelId)],
);

export const userQuietHours = pgTable('user_quiet_hours', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: smallint('category_id').references(() => notificationCategories.id),
  notificationTypeId: uuid('notification_type_id').references(() => notificationTypes.id),
  channelId: smallint('channel_id').notNull().references(() => notificationChannels.id),
  startMinute: smallint('start_minute').notNull(),
  endMinute: smallint('end_minute').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const globalPolicyVersions = pgTable('global_policy_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  version: integer('version').notNull().unique(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const globalNotificationPolicies = pgTable('global_notification_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => globalPolicyVersions.id, { onDelete: 'cascade' }),
  regionId: uuid('region_id').references(() => regions.id),
  categoryId: smallint('category_id').references(() => notificationCategories.id),
  notificationTypeId: uuid('notification_type_id').references(() => notificationTypes.id),
  channelId: smallint('channel_id').references(() => notificationChannels.id),
  deliveryAllowed: boolean('delivery_allowed').notNull().default(true),
  canUserDisable: boolean('can_user_disable').notNull().default(true),
  respectQuietHours: boolean('respect_quiet_hours').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
