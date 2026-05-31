import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { defaultNotificationPreferenceVersions, defaultNotificationPreferences, userNotificationPreferences } from '../db/schema';

export type UserPreferenceRecord = {
  id: string;
  userId: string;
  notificationTypeId: string;
  channelId: number;
  enabled: boolean;
  updatedAt: Date;
};

export type DefaultPreferenceRecord = {
  id: string;
  enabled: boolean;
};

export type PreferenceMutationOperation = 'created' | 'updated' | 'noop';

export type UserPreferenceMutationResult = {
  record: UserPreferenceRecord;
  operation: PreferenceMutationOperation;
  changed: boolean;
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
        updatedAt: userNotificationPreferences.updatedAt,
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
  }): Promise<UserPreferenceMutationResult> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: userNotificationPreferences.id,
          userId: userNotificationPreferences.userId,
          notificationTypeId: userNotificationPreferences.notificationTypeId,
          channelId: userNotificationPreferences.channelId,
          enabled: userNotificationPreferences.enabled,
          updatedAt: userNotificationPreferences.updatedAt,
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

      if (!existing) {
        const [created] = await tx
          .insert(userNotificationPreferences)
          .values({
            userId: input.userId,
            notificationTypeId: input.notificationTypeId,
            channelId: input.channelId,
            enabled: input.enabled,
          })
          .returning({
            id: userNotificationPreferences.id,
            userId: userNotificationPreferences.userId,
            notificationTypeId: userNotificationPreferences.notificationTypeId,
            channelId: userNotificationPreferences.channelId,
            enabled: userNotificationPreferences.enabled,
            updatedAt: userNotificationPreferences.updatedAt,
          });

        return { record: created, operation: 'created', changed: true };
      }

      if (existing.enabled === input.enabled) {
        return { record: existing, operation: 'noop', changed: false };
      }

      const [updated] = await tx
        .update(userNotificationPreferences)
        .set({
          enabled: input.enabled,
          updatedAt: sql`now()`,
        })
        .where(eq(userNotificationPreferences.id, existing.id))
        .returning({
          id: userNotificationPreferences.id,
          userId: userNotificationPreferences.userId,
          notificationTypeId: userNotificationPreferences.notificationTypeId,
          channelId: userNotificationPreferences.channelId,
          enabled: userNotificationPreferences.enabled,
          updatedAt: userNotificationPreferences.updatedAt,
        });

      return { record: updated, operation: 'updated', changed: true };
    });
  }
}
