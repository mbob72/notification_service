import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { defaultNotificationPreferenceVersions, defaultNotificationPreferences, userNotificationPreferences } from '../db/schema';

export type UserPreferenceRecord = {
  id: string;
  userId: string;
  notificationTypeId: string;
  channelId: number;
  enabled: boolean;
};

export type DefaultPreferenceRecord = {
  id: string;
  enabled: boolean;
};

export class PreferencesRepository {
  async findUserPreference(input: {
    userId: string;
    notificationTypeId: string;
    channelId: number;
  }): Promise<UserPreferenceRecord | null> {
    const [row] = await db
      .select({
        id: userNotificationPreferences.id,
        userId: userNotificationPreferences.userId,
        notificationTypeId: userNotificationPreferences.notificationTypeId,
        channelId: userNotificationPreferences.channelId,
        enabled: userNotificationPreferences.enabled,
      })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, input.userId),
          eq(userNotificationPreferences.notificationTypeId, input.notificationTypeId),
          eq(userNotificationPreferences.channelId, input.channelId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findActiveDefaultPreference(input: {
    regionId: string;
    notificationTypeId: string;
    categoryId: number;
    channelId: number;
  }): Promise<DefaultPreferenceRecord | null> {
    const [row] = await db
      .select({ id: defaultNotificationPreferences.id, enabled: defaultNotificationPreferences.enabled })
      .from(defaultNotificationPreferences)
      .innerJoin(
        defaultNotificationPreferenceVersions,
        eq(defaultNotificationPreferences.versionId, defaultNotificationPreferenceVersions.id),
      )
      .where(
        and(
          eq(defaultNotificationPreferenceVersions.regionId, input.regionId),
          isNull(defaultNotificationPreferenceVersions.validTo),
          eq(defaultNotificationPreferences.channelId, input.channelId),
          or(
            eq(defaultNotificationPreferences.notificationTypeId, input.notificationTypeId),
            eq(defaultNotificationPreferences.categoryId, input.categoryId),
          ),
        ),
      )
      .orderBy(sql`CASE
        WHEN ${defaultNotificationPreferences.notificationTypeId} IS NOT NULL THEN 1
        WHEN ${defaultNotificationPreferences.categoryId} IS NOT NULL THEN 2
        ELSE 3
      END`)
      .limit(1);

    return row ?? null;
  }

  async upsertUserPreference(input: {
    userId: string;
    notificationTypeId: string;
    channelId: number;
    enabled: boolean;
  }): Promise<UserPreferenceRecord> {
    const [row] = await db
      .insert(userNotificationPreferences)
      .values({
        userId: input.userId,
        notificationTypeId: input.notificationTypeId,
        channelId: input.channelId,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [
          userNotificationPreferences.userId,
          userNotificationPreferences.notificationTypeId,
          userNotificationPreferences.channelId,
        ],
        set: {
          enabled: input.enabled,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: userNotificationPreferences.id,
        userId: userNotificationPreferences.userId,
        notificationTypeId: userNotificationPreferences.notificationTypeId,
        channelId: userNotificationPreferences.channelId,
        enabled: userNotificationPreferences.enabled,
      });

    return row;
  }
}
