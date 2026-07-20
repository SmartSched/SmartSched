-- One reflection row per user per day, so submitting again edits today's ratings
-- instead of creating a duplicate row.

alter table reflections
  add constraint reflections_user_date_unique unique (user_id, date);
