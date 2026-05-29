# Effective notification config resolution order

Resolve effective config in this order:

1. notification type/channel matrix (`notification_type_channels`)
2. default notification preferences for the user's region (active `default_notification_preference_versions` + `default_notification_preferences`)
3. default quiet hours for the user's region (active `default_quiet_hour_versions` + `default_quiet_hours`)
4. user notification preference overrides (`user_notification_preferences`)
5. user quiet-hour overrides (`user_quiet_hours`)
6. global policy constraints (active `global_policy_versions` + `global_notification_policies`)

Global policies are applied last and act as hard constraints.

Policy specificity inside step 6 should be deterministic:

1. broad global rule (`region_id`, `channel_id`, `category_id`, `notification_type_id` are all `NULL`)
2. region-scoped rule
3. channel-scoped rule
4. category-scoped rule
5. notification-type-scoped rule (most specific)

Current schema note:

- `user_quiet_hours` does not encode an explicit empty override (`[]`) separately from `inherit default` when no rows exist.
- If product needs explicit disable semantics, add a scope table (for example `user_quiet_hour_settings` with mode `inherit|custom|disabled`) in a follow-up migration.
