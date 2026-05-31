import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { defaultQuietHours, defaultQuietHourVersions, userQuietHours } from '../db/schema';

export type QuietHourRecord = {
  id: string;
  startMinute: number;
  endMinute: number;
};

export type QuietHoursMutationResult = {
  records: QuietHourRecord[];
  operation: 'updated' | 'noop';
  changed: boolean;
};

function normalizeWindows<T extends { startMinute: number; endMinute: number }>(windows: T[]): T[] {
  return [...windows].sort((a, b) => {
    if (a.startMinute !== b.startMinute) {
      return a.startMinute - b.startMinute;
    }
    return a.endMinute - b.endMinute;
  });
}

export class QuietHoursRepository {
  async findUserQuietHours(input: {
    userId: string;
    notificationTypeId: string;
    categoryId: number;
    channelId: number;
  }): Promise<QuietHourRecord[]> {
    const exact = await db
      .select({
        id: userQuietHours.id,
        startMinute: userQuietHours.startMinute,
        endMinute: userQuietHours.endMinute,
      })
      .from(userQuietHours)
      .where(
        and(
          eq(userQuietHours.userId, input.userId),
          eq(userQuietHours.channelId, input.channelId),
          eq(userQuietHours.notificationTypeId, input.notificationTypeId),
        ),
      );

    if (exact.length > 0) {
      return exact;
    }

    return db
      .select({
        id: userQuietHours.id,
        startMinute: userQuietHours.startMinute,
        endMinute: userQuietHours.endMinute,
      })
      .from(userQuietHours)
      .where(
        and(
          eq(userQuietHours.userId, input.userId),
          eq(userQuietHours.channelId, input.channelId),
          eq(userQuietHours.categoryId, input.categoryId),
          isNull(userQuietHours.notificationTypeId),
        ),
      );
  }

  async findActiveDefaultQuietHours(input: {
    regionId: string;
    notificationTypeId: string;
    categoryId: number;
    channelId: number;
  }): Promise<QuietHourRecord[]> {
    const exact = await db
      .select({
        id: defaultQuietHours.id,
        startMinute: defaultQuietHours.startMinute,
        endMinute: defaultQuietHours.endMinute,
      })
      .from(defaultQuietHours)
      .innerJoin(defaultQuietHourVersions, eq(defaultQuietHours.versionId, defaultQuietHourVersions.id))
      .where(
        and(
          eq(defaultQuietHourVersions.regionId, input.regionId),
          isNull(defaultQuietHourVersions.validTo),
          eq(defaultQuietHours.channelId, input.channelId),
          eq(defaultQuietHours.notificationTypeId, input.notificationTypeId),
        ),
      );

    if (exact.length > 0) {
      return exact;
    }

    return db
      .select({
        id: defaultQuietHours.id,
        startMinute: defaultQuietHours.startMinute,
        endMinute: defaultQuietHours.endMinute,
      })
      .from(defaultQuietHours)
      .innerJoin(defaultQuietHourVersions, eq(defaultQuietHours.versionId, defaultQuietHourVersions.id))
      .where(
        and(
          eq(defaultQuietHourVersions.regionId, input.regionId),
          isNull(defaultQuietHourVersions.validTo),
          eq(defaultQuietHours.channelId, input.channelId),
          eq(defaultQuietHours.categoryId, input.categoryId),
          isNull(defaultQuietHours.notificationTypeId),
        ),
      );
  }

  async replaceUserQuietHours(input: {
    userId: string;
    notificationTypeId: string;
    channelId: number;
    windows: Array<{ startMinute: number; endMinute: number }>;
  }): Promise<QuietHoursMutationResult> {
    return db.transaction(async (tx) => {
      const current = await tx
        .select({
          id: userQuietHours.id,
          startMinute: userQuietHours.startMinute,
          endMinute: userQuietHours.endMinute,
        })
        .from(userQuietHours)
        .where(
          and(
            eq(userQuietHours.userId, input.userId),
            eq(userQuietHours.notificationTypeId, input.notificationTypeId),
            eq(userQuietHours.channelId, input.channelId),
          ),
        );

      const normalizedCurrent = normalizeWindows(current);
      const normalizedInput = normalizeWindows(input.windows);

      if (
        normalizedCurrent.length === normalizedInput.length &&
        normalizedCurrent.every(
          (window, index) =>
            window.startMinute === normalizedInput[index]?.startMinute &&
            window.endMinute === normalizedInput[index]?.endMinute,
        )
      ) {
        return {
          records: normalizedCurrent,
          operation: 'noop',
          changed: false,
        };
      }

      await tx
        .delete(userQuietHours)
        .where(
          and(
            eq(userQuietHours.userId, input.userId),
            eq(userQuietHours.notificationTypeId, input.notificationTypeId),
            eq(userQuietHours.channelId, input.channelId),
          ),
        );

      if (input.windows.length === 0) {
        return { records: [], operation: 'updated', changed: true };
      }

      const records = await tx
        .insert(userQuietHours)
        .values(
          input.windows.map((window) => ({
            userId: input.userId,
            notificationTypeId: input.notificationTypeId,
            channelId: input.channelId,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
          })),
        )
        .returning({
          id: userQuietHours.id,
          startMinute: userQuietHours.startMinute,
          endMinute: userQuietHours.endMinute,
        });

      return {
        records: normalizeWindows(records),
        operation: 'updated',
        changed: true,
      };
    });
  }
}
