-- Personal columns are now encrypted by the server before they're saved (server/crypto.js): each holds
-- "enc:v1:..." instead of the readable value, and a JSON column holds that as a JSON string. These checks
-- assumed readable values, so they're dropped or widened. The server still checks the readable values.

-- JSON columns that had to be objects now hold an encrypted string.
alter table profiles drop constraint if exists profiles_scheduler_preferences_check;
alter table user_learning_events drop constraint if exists user_learning_events_data_check;

-- Encrypted text is about a third longer than the original (the server keeps its 90,000 and 2,000 limits).
alter table profiles drop constraint if exists profiles_avatar_check;
alter table profiles add constraint profiles_avatar_check
  check (avatar is null or length(avatar) <= 130000);
alter table calendar_feeds drop constraint if exists calendar_feeds_url_check;
alter table calendar_feeds add constraint calendar_feeds_url_check check (length(url) <= 3000);

-- The same link encrypts differently every time, so this no longer stops duplicates (the server does).
alter table calendar_feeds drop constraint if exists calendar_feeds_user_id_url_key;
