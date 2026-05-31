import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { db } from '../db';
import { notificationChannels, notificationTypes, userNotificationPreferences, userQuietHours } from '../db/schema';
import { integrationFixtures } from './integration-fixtures';

const app = createApp();

const USER_ID = integrationFixtures.userId;
const NOTIFICATION_TYPE_CODE = integrationFixtures.promoTypeCode;
const TRANSACTIONAL_TYPE_CODE = integrationFixtures.transactionalTypeCode;
const EMAIL_CHANNEL_CODE = integrationFixtures.channelCodes.email;
const PUSH_CHANNEL_CODE = integrationFixtures.channelCodes.push;
const SMS_CHANNEL_CODE = integrationFixtures.channelCodes.sms;

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

describe('controller integration', () => {
  describe('error responses', () => {
    it('returns unknown_user for missing user', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: '00000000-0000-0000-0000-000000000099',
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('unknown_user');
    });

    it('returns region_mismatch when request region differs from user region', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        regionCode: 'US',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('region_mismatch');
    });

    it('returns validation_error for invalid channel', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: 'pager',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });

    it('returns unknown_notification_type for missing notification type', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: 'unknown_type',
        channelCode: EMAIL_CHANNEL_CODE,
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('unknown_notification_type');
    });
  });

  describe('preferences endpoints', () => {
    it('returns default preference for new user', async () => {
      const response = await request(app)
        .get(`/users/${USER_ID}/preferences`)
        .query({ notificationTypeCode: NOTIFICATION_TYPE_CODE, channelCode: EMAIL_CHANNEL_CODE });

      expect(response.status).toBe(200);
      expect(response.body.data.enabled).toBe(false);
      expect(response.body.data.source.enabled).toBe('default');
    });

    it('applies user preference change and returns user source', async () => {
      const update = await request(app).post(`/users/${USER_ID}/preferences`).send({
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        enabled: true,
      });

      expect(update.status).toBe(200);
      expect(update.body.data.enabled).toBe(true);
      expect(update.body.data.source.enabled).toBe('user');
      expect(update.body.meta.changed).toBe(true);

      const get = await request(app)
        .get(`/users/${USER_ID}/preferences`)
        .query({ notificationTypeCode: NOTIFICATION_TYPE_CODE, channelCode: EMAIL_CHANNEL_CODE });

      expect(get.status).toBe(200);
      expect(get.body.data.enabled).toBe(true);
      expect(get.body.data.source.enabled).toBe('user');
    });

    it('keeps enabled update idempotent and preserves updated_at on noop', async () => {
      const { notificationTypeId, channelId } = await getTypeIdAndChannelId(EMAIL_CHANNEL_CODE);

      const first = await request(app).post(`/users/${USER_ID}/preferences`).send({
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

      const second = await request(app).post(`/users/${USER_ID}/preferences`).send({
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

      expect(first.status).toBe(200);
      expect(['created', 'updated']).toContain(first.body.meta.operation);
      expect(first.body.meta.changed).toBe(true);
      expect(second.status).toBe(200);
      expect(second.body.meta.operation).toBe('noop');
      expect(second.body.meta.changed).toBe(false);
      expect(afterFirst?.updatedAt.toISOString()).toBe(afterSecond?.updatedAt.toISOString());
    });

    it('keeps quiet hours replacement idempotent', async () => {
      const windows = [{ startMinute: 1320, endMinute: 480 }];

      const first = await request(app).post(`/users/${USER_ID}/preferences`).send({
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: PUSH_CHANNEL_CODE,
        quietHours: windows,
      });

      const second = await request(app).post(`/users/${USER_ID}/preferences`).send({
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: PUSH_CHANNEL_CODE,
        quietHours: windows,
      });

      expect(first.status).toBe(200);
      expect(first.body.meta.parts.quietHours.operation).toBe('updated');
      expect(first.body.meta.parts.quietHours.changed).toBe(true);

      expect(second.status).toBe(200);
      expect(second.body.meta.operation).toBe('noop');
      expect(second.body.meta.changed).toBe(false);
      expect(second.body.meta.parts.quietHours.operation).toBe('noop');
      expect(second.body.meta.parts.quietHours.changed).toBe(false);
    });
  });

  describe('evaluate branches', () => {
    it('returns blocked_by_global_policy when global deny exists (highest priority)', async () => {
      await request(app).post(`/users/${USER_ID}/preferences`).send({
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: SMS_CHANNEL_CODE,
        enabled: true,
      });

      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: SMS_CHANNEL_CODE,
        regionCode: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
    });

    it('returns disabled_by_user when user override disables delivery', async () => {
      await request(app).post(`/users/${USER_ID}/preferences`).send({
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: PUSH_CHANNEL_CODE,
        enabled: false,
      });

      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: PUSH_CHANNEL_CODE,
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'deny', reason: 'disabled_by_user' });
    });

    it('returns disabled_by_default when default is disabled and no user override exists', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'deny', reason: 'disabled_by_default' });
    });

    it('returns blocked_by_quiet_hours for marketing inside quiet hours', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: NOTIFICATION_TYPE_CODE,
        channelCode: PUSH_CHANNEL_CODE,
        datetime: '2026-05-21T21:30:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'deny', reason: 'blocked_by_quiet_hours' });
    });

    it('returns allowed when no blocking rule applies', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: TRANSACTIONAL_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        datetime: '2026-05-21T12:00:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'allow', reason: 'allowed' });
    });

    it('allows transactional notification even inside quiet hours', async () => {
      const response = await request(app).post('/evaluate').send({
        userId: USER_ID,
        notificationTypeCode: TRANSACTIONAL_TYPE_CODE,
        channelCode: EMAIL_CHANNEL_CODE,
        datetime: '2026-05-21T21:30:00Z',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ decision: 'allow', reason: 'allowed' });
    });
  });

});
