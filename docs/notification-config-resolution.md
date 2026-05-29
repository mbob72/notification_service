# Effective notification config resolution order

Resolve effective config in this order:

1. notification type/channel matrix (`notification_type_channels`)
2. default notification preferences for the user's region (active `default_notification_preference_versions` + `default_notification_preferences`)
3. default quiet hours for the user's region (active `default_quiet_hour_versions` + `default_quiet_hours`)
4. user notification preference overrides (`user_notification_preferences`)
5. user quiet-hour overrides (`user_quiet_hours`)
6. global policy constraints (active `global_policy_versions` + `global_notification_policies`)

Global policies are applied last and act as hard constraints.
