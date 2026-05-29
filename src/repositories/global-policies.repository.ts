import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { globalNotificationPolicies, globalPolicyVersions } from '../db/schema';

export type GlobalPolicyRecord = {
  id: string;
  deliveryAllowed: boolean;
  canUserDisable: boolean;
  respectQuietHours: boolean;
};

export class GlobalPoliciesRepository {
  async findMatchingActivePolicy(input: {
    regionId: string;
    notificationTypeId: string;
    categoryId: number;
    channelId: number;
  }): Promise<GlobalPolicyRecord | null> {
    const [row] = await db
      .select({
        id: globalNotificationPolicies.id,
        deliveryAllowed: globalNotificationPolicies.deliveryAllowed,
        canUserDisable: globalNotificationPolicies.canUserDisable,
        respectQuietHours: globalNotificationPolicies.respectQuietHours,
      })
      .from(globalNotificationPolicies)
      .innerJoin(globalPolicyVersions, eq(globalNotificationPolicies.versionId, globalPolicyVersions.id))
      .where(
        and(
          isNull(globalPolicyVersions.validTo),
          or(eq(globalNotificationPolicies.regionId, input.regionId), isNull(globalNotificationPolicies.regionId)),
          or(eq(globalNotificationPolicies.channelId, input.channelId), isNull(globalNotificationPolicies.channelId)),
          or(
            eq(globalNotificationPolicies.notificationTypeId, input.notificationTypeId),
            eq(globalNotificationPolicies.categoryId, input.categoryId),
            and(isNull(globalNotificationPolicies.notificationTypeId), isNull(globalNotificationPolicies.categoryId)),
          ),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${globalNotificationPolicies.regionId} IS NULL THEN 1 ELSE 0 END`,
        sql`CASE WHEN ${globalNotificationPolicies.channelId} IS NULL THEN 1 ELSE 0 END`,
        sql`CASE
          WHEN ${globalNotificationPolicies.notificationTypeId} IS NOT NULL THEN 0
          WHEN ${globalNotificationPolicies.categoryId} IS NOT NULL THEN 1
          ELSE 2
        END`,
      )
      .limit(1);

    return row ?? null;
  }
}
