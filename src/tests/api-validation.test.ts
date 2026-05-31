import { describe, expect, it } from 'vitest';
import { getPreferenceQuerySchema, updatePreferenceBodySchema } from '../api/validation';

describe('updatePreferenceBodySchema', () => {
  it('requires at least one of enabled or quietHours', () => {
    const result = updatePreferenceBodySchema.safeParse({
      notificationTypeCode: 'promo_campaign',
      channelCode: 'email',
    });

    expect(result.success).toBe(false);
  });

  it('rejects quiet hours with identical start/end minutes', () => {
    const result = updatePreferenceBodySchema.safeParse({
      notificationTypeCode: 'promo_campaign',
      channelCode: 'push',
      quietHours: [{ startMinute: 600, endMinute: 600 }],
    });

    expect(result.success).toBe(false);
  });

  it('accepts payload with enabled flag', () => {
    const result = updatePreferenceBodySchema.safeParse({
      notificationTypeCode: 'promo_campaign',
      channelCode: 'email',
      enabled: false,
    });

    expect(result.success).toBe(true);
  });
});

describe('getPreferenceQuerySchema', () => {
  it('accepts empty query for list mode', () => {
    const result = getPreferenceQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects partially provided query params', () => {
    const result = getPreferenceQuerySchema.safeParse({ notificationTypeCode: 'promo_campaign' });
    expect(result.success).toBe(false);
  });
});
