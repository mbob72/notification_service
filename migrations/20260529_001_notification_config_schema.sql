-- Notification configuration schema
-- Idempotent PostgreSQL migration for:
-- defaults, user overrides, quiet hours, and global policies.

BEGIN;

-- UUID generation helper.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) regions (create only if absent)
CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE regions IS 'Geographic/business region used to scope defaults and policies.';
COMMENT ON COLUMN regions.code IS 'Stable unique region code (e.g. EU, US, APAC).';

-- 2) users (create minimal shape only if absent)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone text NOT NULL,
  region_id uuid NOT NULL REFERENCES regions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- If users already exists, add required columns safely.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS region_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE users IS 'Application users with timezone and region for effective notification config resolution.';
COMMENT ON COLUMN users.timezone IS 'IANA timezone name used for local quiet-hour evaluation.';
COMMENT ON COLUMN users.region_id IS 'Region used to select active default preference and quiet-hour versions.';

-- Add FK for users.region_id only when possible and missing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'region_id'
      AND udt_name = 'uuid'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'regions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'users'
      AND c.conname = 'users_region_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_region_id_fkey
      FOREIGN KEY (region_id)
      REFERENCES regions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_region_id ON users(region_id);

-- 3) notification_channels
CREATE TABLE IF NOT EXISTS notification_channels (
  id smallserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_channels IS 'Lookup table for delivery channels.';
COMMENT ON COLUMN notification_channels.code IS 'Channel code: email, push, sms, messenger.';

-- 4) notification_categories
CREATE TABLE IF NOT EXISTS notification_categories (
  id smallserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_categories IS 'Lookup table for high-level notification categories.';
COMMENT ON COLUMN notification_categories.code IS 'Category code: transactional, marketing.';

-- 5) notification_types
CREATE TABLE IF NOT EXISTS notification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  category_id smallint NOT NULL REFERENCES notification_categories(id),
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_types IS 'Concrete notification event types (e.g. payment_success).';
COMMENT ON COLUMN notification_types.category_id IS 'Owning category for the event type.';

-- 6) notification_type_channels
CREATE TABLE IF NOT EXISTS notification_type_channels (
  notification_type_id uuid NOT NULL REFERENCES notification_types(id) ON DELETE CASCADE,
  channel_id smallint NOT NULL REFERENCES notification_channels(id),
  is_enabled_by_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_type_id, channel_id)
);

COMMENT ON TABLE notification_type_channels IS 'Allowed channel matrix per notification type.';

-- 7) default_notification_preference_versions
CREATE TABLE IF NOT EXISTS default_notification_preference_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id),
  version integer NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NULL,
  CONSTRAINT chk_dnpv_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, version)
);

COMMENT ON TABLE default_notification_preference_versions IS 'Version registry of regional default notification preferences.';
COMMENT ON COLUMN default_notification_preference_versions.valid_to IS 'NULL means active version.';

-- Supports selecting currently active default preference version for region.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dnpv_region_active
  ON default_notification_preference_versions(region_id)
  WHERE valid_to IS NULL;

-- 8) default_notification_preferences
CREATE TABLE IF NOT EXISTS default_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES default_notification_preference_versions(id) ON DELETE CASCADE,
  category_id smallint NULL REFERENCES notification_categories(id),
  notification_type_id uuid NULL REFERENCES notification_types(id),
  channel_id smallint NOT NULL REFERENCES notification_channels(id),
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_default_notification_preferences_scope_xor CHECK (
    (category_id IS NOT NULL AND notification_type_id IS NULL)
    OR
    (category_id IS NULL AND notification_type_id IS NOT NULL)
  )
);

COMMENT ON TABLE default_notification_preferences IS 'Regional default enable/disable preferences by version.';
COMMENT ON COLUMN default_notification_preferences.category_id IS 'Category-wide default scope (mutually exclusive with notification_type_id).';
COMMENT ON COLUMN default_notification_preferences.notification_type_id IS 'Notification-type scope (mutually exclusive with category_id).';

-- Enforces one type-level default preference per version+channel+notification_type.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dnp_version_channel_type
  ON default_notification_preferences(version_id, channel_id, notification_type_id)
  WHERE notification_type_id IS NOT NULL;

-- Enforces one category-level default preference per version+channel+category.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dnp_version_channel_category
  ON default_notification_preferences(version_id, channel_id, category_id)
  WHERE category_id IS NOT NULL;

-- 9) default_quiet_hour_versions
CREATE TABLE IF NOT EXISTS default_quiet_hour_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id),
  version integer NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NULL,
  CONSTRAINT chk_dqhv_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, version)
);

COMMENT ON TABLE default_quiet_hour_versions IS 'Version registry of regional default quiet hours.';
COMMENT ON COLUMN default_quiet_hour_versions.valid_to IS 'NULL means active version.';

-- Supports selecting currently active default quiet-hour version for region.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dqhv_region_active
  ON default_quiet_hour_versions(region_id)
  WHERE valid_to IS NULL;

-- 10) default_quiet_hours
CREATE TABLE IF NOT EXISTS default_quiet_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES default_quiet_hour_versions(id) ON DELETE CASCADE,
  category_id smallint NULL REFERENCES notification_categories(id),
  notification_type_id uuid NULL REFERENCES notification_types(id),
  channel_id smallint NOT NULL REFERENCES notification_channels(id),
  start_minute smallint NOT NULL,
  end_minute smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_default_quiet_hours_scope_xor CHECK (
    (category_id IS NOT NULL AND notification_type_id IS NULL)
    OR
    (category_id IS NULL AND notification_type_id IS NOT NULL)
  ),
  CONSTRAINT chk_default_quiet_hours_start_range CHECK (start_minute BETWEEN 0 AND 1439),
  CONSTRAINT chk_default_quiet_hours_end_range CHECK (end_minute BETWEEN 0 AND 1439),
  CONSTRAINT chk_default_quiet_hours_not_equal CHECK (start_minute <> end_minute)
);

COMMENT ON TABLE default_quiet_hours IS 'Regional default quiet-hour intervals by version; cross-midnight intervals allowed.';
COMMENT ON COLUMN default_quiet_hours.start_minute IS 'Start minute in local day [0..1439].';
COMMENT ON COLUMN default_quiet_hours.end_minute IS 'End minute in local day [0..1439]; may be less than start_minute for cross-midnight.';

-- Supports resolving quiet hours by active version + channel + exact type.
CREATE INDEX IF NOT EXISTS idx_dqh_version_channel_type
  ON default_quiet_hours(version_id, channel_id, notification_type_id)
  WHERE notification_type_id IS NOT NULL;

-- Supports resolving quiet hours by active version + channel + category fallback.
CREATE INDEX IF NOT EXISTS idx_dqh_version_channel_category
  ON default_quiet_hours(version_id, channel_id, category_id)
  WHERE category_id IS NOT NULL;

-- 11) user_notification_preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type_id uuid NOT NULL REFERENCES notification_types(id),
  channel_id smallint NOT NULL REFERENCES notification_channels(id),
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type_id, channel_id)
);

COMMENT ON TABLE user_notification_preferences IS 'User-specific overrides for notification enabled/disabled state.';

-- Supports quick lookup of user override by user + type + channel.
CREATE INDEX IF NOT EXISTS idx_unp_user_type_channel
  ON user_notification_preferences(user_id, notification_type_id, channel_id);

-- 12) user_quiet_hours
CREATE TABLE IF NOT EXISTS user_quiet_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id smallint NULL REFERENCES notification_categories(id),
  notification_type_id uuid NULL REFERENCES notification_types(id),
  channel_id smallint NOT NULL REFERENCES notification_channels(id),
  start_minute smallint NOT NULL,
  end_minute smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_quiet_hours_scope_xor CHECK (
    (category_id IS NOT NULL AND notification_type_id IS NULL)
    OR
    (category_id IS NULL AND notification_type_id IS NOT NULL)
  ),
  CONSTRAINT chk_user_quiet_hours_start_range CHECK (start_minute BETWEEN 0 AND 1439),
  CONSTRAINT chk_user_quiet_hours_end_range CHECK (end_minute BETWEEN 0 AND 1439),
  CONSTRAINT chk_user_quiet_hours_not_equal CHECK (start_minute <> end_minute)
);

COMMENT ON TABLE user_quiet_hours IS 'User-specific quiet-hour overrides; cross-midnight intervals allowed.';

-- Supports resolving user quiet-hour override by user + channel + exact type.
CREATE INDEX IF NOT EXISTS idx_uqh_user_channel_type
  ON user_quiet_hours(user_id, channel_id, notification_type_id)
  WHERE notification_type_id IS NOT NULL;

-- Supports resolving user quiet-hour fallback by user + channel + category.
CREATE INDEX IF NOT EXISTS idx_uqh_user_channel_category
  ON user_quiet_hours(user_id, channel_id, category_id)
  WHERE category_id IS NOT NULL;

-- 13) global_policy_versions
CREATE TABLE IF NOT EXISTS global_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NULL,
  CONSTRAINT chk_gpv_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE global_policy_versions IS 'Version registry for hard global policy constraints.';
COMMENT ON COLUMN global_policy_versions.valid_to IS 'NULL means active version.';

-- Supports selecting the currently active global policy version.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gpv_active
  ON global_policy_versions((1))
  WHERE valid_to IS NULL;

-- 14) global_notification_policies
CREATE TABLE IF NOT EXISTS global_notification_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES global_policy_versions(id) ON DELETE CASCADE,
  region_id uuid NULL REFERENCES regions(id),
  category_id smallint NULL REFERENCES notification_categories(id),
  notification_type_id uuid NULL REFERENCES notification_types(id),
  channel_id smallint NULL REFERENCES notification_channels(id),
  delivery_allowed boolean NOT NULL DEFAULT true,
  can_user_disable boolean NOT NULL DEFAULT true,
  respect_quiet_hours boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_global_policies_scope_not_both CHECK (
    NOT (category_id IS NOT NULL AND notification_type_id IS NOT NULL)
  )
);

COMMENT ON TABLE global_notification_policies IS 'Hard constraints applied after defaults and user overrides.';
COMMENT ON COLUMN global_notification_policies.region_id IS 'NULL means policy applies to all regions.';
COMMENT ON COLUMN global_notification_policies.channel_id IS 'NULL means policy applies to all channels.';
COMMENT ON COLUMN global_notification_policies.category_id IS 'Nullable broad scope selector.';
COMMENT ON COLUMN global_notification_policies.notification_type_id IS 'Nullable specific scope selector.';

-- Supports policy lookup by active version + exact match dimensions.
CREATE INDEX IF NOT EXISTS idx_gnp_version_region_channel_type
  ON global_notification_policies(version_id, region_id, channel_id, notification_type_id)
  WHERE notification_type_id IS NOT NULL;

-- Supports policy lookup by active version + category-level match.
CREATE INDEX IF NOT EXISTS idx_gnp_version_region_channel_category
  ON global_notification_policies(version_id, region_id, channel_id, category_id)
  WHERE notification_type_id IS NULL AND category_id IS NOT NULL;

-- Supports broad policy lookup by active version for global/channel/region fallbacks.
CREATE INDEX IF NOT EXISTS idx_gnp_version_region_channel_broad
  ON global_notification_policies(version_id, region_id, channel_id)
  WHERE notification_type_id IS NULL AND category_id IS NULL;

-- Seed lookup values
INSERT INTO notification_channels (code)
VALUES
  ('email'),
  ('push'),
  ('sms'),
  ('messenger')
ON CONFLICT (code) DO NOTHING;

INSERT INTO notification_categories (code)
VALUES
  ('transactional'),
  ('marketing')
ON CONFLICT (code) DO NOTHING;

COMMIT;
