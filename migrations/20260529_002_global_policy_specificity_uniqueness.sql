-- Enforce deterministic global policy matching by preventing duplicate rules
-- at the same specificity within a version.

BEGIN;

-- Type-scoped policy uniqueness per version + region-scope + channel-scope + notification type.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gnp_unique_scope_type
  ON global_notification_policies (
    version_id,
    COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel_id, -1),
    notification_type_id
  )
  WHERE notification_type_id IS NOT NULL AND category_id IS NULL;

-- Category-scoped policy uniqueness per version + region-scope + channel-scope + category.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gnp_unique_scope_category
  ON global_notification_policies (
    version_id,
    COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel_id, -1),
    category_id
  )
  WHERE notification_type_id IS NULL AND category_id IS NOT NULL;

-- Broad policy uniqueness per version + region-scope + channel-scope.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gnp_unique_scope_broad
  ON global_notification_policies (
    version_id,
    COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel_id, -1)
  )
  WHERE notification_type_id IS NULL AND category_id IS NULL;

COMMIT;
