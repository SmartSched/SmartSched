-- The preference JSON the scheduler ranks calendars by (format: ml/prefs/schema.py). The preference model
-- writes it from the survey and the user's history; until then it stays null and the scheduler uses the
-- survey alone. The scheduler cleans it on every request, so a bad value can't break scheduling.
-- preference_model_version says which model (or rules) wrote it.

alter table profiles
  add column scheduler_preferences jsonb
    check (scheduler_preferences is null or jsonb_typeof(scheduler_preferences) = 'object'),
  add column preferences_updated_at timestamptz,
  add column preference_model_version text;
