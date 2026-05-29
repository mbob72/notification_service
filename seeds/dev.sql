BEGIN;

INSERT INTO regions (code, name)
VALUES ('EU', 'Europe')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (id, timezone, region_id)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Europe/Belgrade',
  r.id
FROM regions r
WHERE r.code = 'EU'
ON CONFLICT (id) DO UPDATE
SET
  timezone = EXCLUDED.timezone,
  region_id = EXCLUDED.region_id,
  updated_at = now();

INSERT INTO notification_types (code, category_id, description, is_active)
SELECT
  'payment_success',
  c.id,
  'Payment completed successfully',
  true
FROM notification_categories c
WHERE c.code = 'transactional'
ON CONFLICT (code) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

INSERT INTO notification_types (code, category_id, description, is_active)
SELECT
  'promo_campaign',
  c.id,
  'Promotional campaign message',
  true
FROM notification_categories c
WHERE c.code = 'marketing'
ON CONFLICT (code) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

INSERT INTO notification_type_channels (notification_type_id, channel_id, is_enabled_by_default)
SELECT
  nt.id,
  ch.id,
  true
FROM notification_types nt
JOIN notification_channels ch ON ch.code IN ('email', 'push', 'sms')
WHERE nt.code = 'promo_campaign'
ON CONFLICT (notification_type_id, channel_id) DO NOTHING;

INSERT INTO notification_type_channels (notification_type_id, channel_id, is_enabled_by_default)
SELECT
  nt.id,
  ch.id,
  true
FROM notification_types nt
JOIN notification_channels ch ON ch.code = 'email'
WHERE nt.code = 'payment_success'
ON CONFLICT (notification_type_id, channel_id) DO NOTHING;

INSERT INTO default_notification_preference_versions (region_id, version, valid_from, valid_to)
SELECT
  r.id,
  1,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL
FROM regions r
WHERE r.code = 'EU'
ON CONFLICT (region_id, version) DO NOTHING;

INSERT INTO default_notification_preferences (
  version_id,
  category_id,
  notification_type_id,
  channel_id,
  enabled
)
WITH defaults(notification_type_code, channel_code, enabled) AS (
  VALUES
    ('payment_success'::text, 'email'::text, true),
    ('promo_campaign'::text, 'email'::text, false),
    ('promo_campaign'::text, 'push'::text, true),
    ('promo_campaign'::text, 'sms'::text, true)
)
SELECT
  dnpv.id,
  NULL,
  nt.id,
  ch.id,
  defaults.enabled
FROM default_notification_preference_versions dnpv
JOIN regions r ON r.id = dnpv.region_id
JOIN defaults ON true
JOIN notification_types nt ON nt.code = defaults.notification_type_code
JOIN notification_channels ch ON ch.code = defaults.channel_code
WHERE r.code = 'EU'
  AND dnpv.version = 1
  AND NOT EXISTS (
    SELECT 1
    FROM default_notification_preferences dnp
    WHERE dnp.version_id = dnpv.id
      AND dnp.channel_id = ch.id
      AND dnp.notification_type_id = nt.id
  );

INSERT INTO default_quiet_hour_versions (region_id, version, valid_from, valid_to)
SELECT
  r.id,
  1,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL
FROM regions r
WHERE r.code = 'EU'
ON CONFLICT (region_id, version) DO NOTHING;

INSERT INTO default_quiet_hours (
  version_id,
  category_id,
  notification_type_id,
  channel_id,
  start_minute,
  end_minute
)
SELECT
  dqhv.id,
  NULL,
  nt.id,
  ch.id,
  1320,
  480
FROM default_quiet_hour_versions dqhv
JOIN regions r ON r.id = dqhv.region_id
JOIN notification_types nt ON nt.code = 'promo_campaign'
JOIN notification_channels ch ON ch.code = 'push'
WHERE r.code = 'EU'
  AND dqhv.version = 1
  AND NOT EXISTS (
    SELECT 1
    FROM default_quiet_hours dqh
    WHERE dqh.version_id = dqhv.id
      AND dqh.channel_id = ch.id
      AND dqh.notification_type_id = nt.id
      AND dqh.start_minute = 1320
      AND dqh.end_minute = 480
  );

INSERT INTO global_policy_versions (version, valid_from, valid_to)
VALUES (1, '2026-01-01T00:00:00Z'::timestamptz, NULL)
ON CONFLICT (version) DO NOTHING;

INSERT INTO global_notification_policies (
  version_id,
  region_id,
  category_id,
  notification_type_id,
  channel_id,
  delivery_allowed,
  can_user_disable,
  respect_quiet_hours
)
SELECT
  gpv.id,
  r.id,
  NULL,
  nt.id,
  ch.id,
  false,
  true,
  true
FROM global_policy_versions gpv
JOIN regions r ON r.code = 'EU'
JOIN notification_types nt ON nt.code = 'promo_campaign'
JOIN notification_channels ch ON ch.code = 'sms'
WHERE gpv.version = 1
  AND NOT EXISTS (
    SELECT 1
    FROM global_notification_policies gnp
    WHERE gnp.version_id = gpv.id
      AND gnp.region_id = r.id
      AND gnp.channel_id = ch.id
      AND gnp.notification_type_id = nt.id
      AND gnp.category_id IS NULL
  );

COMMIT;
