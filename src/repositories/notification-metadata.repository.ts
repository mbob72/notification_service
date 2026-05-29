import { eq } from 'drizzle-orm';
import { db } from '../db';
import { notificationCategories, notificationChannels, notificationTypes } from '../db/schema';
import type { NotificationCategoryCode } from '../domain/types';

export type ChannelRecord = {
  id: number;
  code: string;
};

export type CategoryRecord = {
  id: number;
  code: NotificationCategoryCode;
};

export type NotificationTypeRecord = {
  id: string;
  code: string;
  categoryId: number;
  categoryCode: NotificationCategoryCode;
};

export class NotificationMetadataRepository {
  async findChannelByCode(code: string): Promise<ChannelRecord | null> {
    const [row] = await db
      .select({ id: notificationChannels.id, code: notificationChannels.code })
      .from(notificationChannels)
      .where(eq(notificationChannels.code, code))
      .limit(1);

    return row ?? null;
  }

  async findCategoryByCode(code: string): Promise<CategoryRecord | null> {
    const [row] = await db
      .select({ id: notificationCategories.id, code: notificationCategories.code })
      .from(notificationCategories)
      .where(eq(notificationCategories.code, code))
      .limit(1);

    return (row as CategoryRecord | undefined) ?? null;
  }

  async findNotificationTypeByCode(code: string): Promise<NotificationTypeRecord | null> {
    const [row] = await db
      .select({
        id: notificationTypes.id,
        code: notificationTypes.code,
        categoryId: notificationTypes.categoryId,
        categoryCode: notificationCategories.code,
      })
      .from(notificationTypes)
      .innerJoin(notificationCategories, eq(notificationTypes.categoryId, notificationCategories.id))
      .where(eq(notificationTypes.code, code))
      .limit(1);

    return (row as NotificationTypeRecord | undefined) ?? null;
  }
}
