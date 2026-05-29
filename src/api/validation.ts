import { z } from 'zod';

const postgresUuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const postgresUuidSchema = z.string().regex(postgresUuidRegex, 'Invalid UUID');

export const channelCodeSchema = z.enum(['email', 'push', 'sms', 'messenger']);
export const notificationTypeCodeSchema = z.string().min(1);
export const regionCodeSchema = z.string().min(1);
export const isoDatetimeSchema = z.string().datetime();
export const minuteSchema = z.number().int().min(0).max(1439);

export const quietHoursWindowSchema = z
  .object({
    startMinute: minuteSchema,
    endMinute: minuteSchema,
  })
  .refine((value) => value.startMinute !== value.endMinute, {
    message: 'startMinute and endMinute must be different',
  });

export const getPreferenceQuerySchema = z.object({
  notificationTypeCode: notificationTypeCodeSchema,
  channelCode: channelCodeSchema,
});

export const updatePreferenceBodySchema = z
  .object({
    notificationTypeCode: notificationTypeCodeSchema,
    channelCode: channelCodeSchema,
    enabled: z.boolean().optional(),
    quietHours: z.array(quietHoursWindowSchema).optional(),
  })
  .refine((value) => value.enabled !== undefined || value.quietHours !== undefined, {
    message: 'At least one of enabled or quietHours must be provided',
  });

export const evaluateBodySchema = z.object({
  userId: postgresUuidSchema,
  notificationTypeCode: notificationTypeCodeSchema,
  channelCode: channelCodeSchema,
  regionCode: regionCodeSchema.optional(),
  datetime: isoDatetimeSchema,
});

export const userIdParamSchema = z.object({
  userId: postgresUuidSchema,
});
