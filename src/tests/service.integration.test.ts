import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { notificationChannels, notificationTypes, userNotificationPreferences, userQuietHours } from '../db/schema';
import { EvaluationService } from '../services/evaluation.service';
import { PreferencesService } from '../services/preferences.service';
import { integrationFixtures } from './integration-fixtures';

const USER_ID = integrationFixtures.userId;
const NOTIFICATION_TYPE_CODE = integrationFixtures.promoTypeCode;
const TRANSACTIONAL_TYPE_CODE = integrationFixtures.transactionalTypeCode;
const EMAIL_CHANNEL_CODE = integrationFixtures.channelCodes.email;
const PUSH_CHANNEL_CODE = integrationFixtures.channelCodes.push;
const SMS_CHANNEL_CODE = integrationFixtures.channelCodes.sms;

const preferencesService = new PreferencesService();
const evaluationService = new EvaluationService();

async function getTypeIdAndChannelId(channelCode: string) {
  const [row] = await db
    .select({
      notificationTypeId: notificationTypes.id,
      channelId: notificationChannels.id,
    })
    .from(notificationTypes)
    .innerJoin(notificationChannels, eq(notificationChannels.code, channelCode))
    .where(eq(notificationTypes.code, NOTIFICATION_TYPE_CODE))
    .limit(1);

  if (!row) {
    throw new Error(`Missing seed metadata for ${NOTIFICATION_TYPE_CODE}/${channelCode}`);
  }

  return row;
}

beforeEach(async () => {
  await db.delete(userNotificationPreferences).where(eq(userNotificationPreferences.userId, USER_ID));
  await db.delete(userQuietHours).where(eq(userQuietHours.userId, USER_ID));
});

describe('service integration', () => {
  it('uses default settings for a new user', async () => {
    const result = await preferencesService.getEffectivePreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
    });

    expect(result.enabled).toBe(false);
    expect(result.source.enabled).toBe('default');
  });

  it('applies user preference change', async () => {
    await preferencesService.updateUserPreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
      enabled: true,
    });

    const result = await preferencesService.getEffectivePreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
    });

    expect(result.enabled).toBe(true);
    expect(result.source.enabled).toBe('user');
  });

  it('denies notification during quiet hours', async () => {
    const result = await evaluationService.evaluate({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: PUSH_CHANNEL_CODE,
      datetime: '2026-05-21T21:30:00Z',
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('blocked_by_quiet_hours');
  });

  it('denies notification by global policy', async () => {
    const result = await evaluationService.evaluate({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: SMS_CHANNEL_CODE,
      regionCode: 'EU',
      datetime: '2026-05-21T12:00:00Z',
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('blocked_by_global_policy');
  });

  it('allows delivery when no blocking rule applies', async () => {
    const result = await evaluationService.evaluate({
      userId: USER_ID,
      notificationTypeCode: TRANSACTIONAL_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
      datetime: '2026-05-21T12:00:00Z',
    });

    expect(result.decision).toBe('allow');
    expect(result.reason).toBe('allowed');
  });

  it('keeps preference update idempotent and preserves updated_at on noop', async () => {
    const { notificationTypeId, channelId } = await getTypeIdAndChannelId(EMAIL_CHANNEL_CODE);

    const first = await preferencesService.updateUserPreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
      enabled: true,
    });

    const [afterFirst] = await db
      .select({ updatedAt: userNotificationPreferences.updatedAt })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, USER_ID),
          eq(userNotificationPreferences.notificationTypeId, notificationTypeId),
          eq(userNotificationPreferences.channelId, channelId),
        ),
      )
      .limit(1);

    const second = await preferencesService.updateUserPreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: EMAIL_CHANNEL_CODE,
      enabled: true,
    });

    const [afterSecond] = await db
      .select({ updatedAt: userNotificationPreferences.updatedAt })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, USER_ID),
          eq(userNotificationPreferences.notificationTypeId, notificationTypeId),
          eq(userNotificationPreferences.channelId, channelId),
        ),
      )
      .limit(1);

    expect(first.meta.changed).toBe(true);
    expect(['created', 'updated']).toContain(first.meta.operation);
    expect(second.meta.changed).toBe(false);
    expect(second.meta.operation).toBe('noop');
    expect(afterFirst?.updatedAt.toISOString()).toBe(afterSecond?.updatedAt.toISOString());
  });

  it('keeps quiet hours replacement idempotent', async () => {
    const windows = [{ startMinute: 1320, endMinute: 480 }];

    const first = await preferencesService.updateUserPreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: PUSH_CHANNEL_CODE,
      quietHours: windows,
    });

    const second = await preferencesService.updateUserPreference({
      userId: USER_ID,
      notificationTypeCode: NOTIFICATION_TYPE_CODE,
      channelCode: PUSH_CHANNEL_CODE,
      quietHours: windows,
    });

    expect(first.meta.parts.quietHours?.changed).toBe(true);
    expect(first.meta.parts.quietHours?.operation).toBe('updated');
    expect(second.meta.parts.quietHours?.changed).toBe(false);
    expect(second.meta.parts.quietHours?.operation).toBe('noop');
    expect(second.meta.changed).toBe(false);
    expect(second.meta.operation).toBe('noop');
  });
});
