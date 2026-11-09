-- How the app looks for each user: light, dark or following the device, an accent colour from a fixed set
-- (must match ACCENTS in server/validation.js and src/app/theme.ts), and a profile picture.
--
-- The picture is a small JPEG the browser has already cropped and shrunk to 256x256, kept inline as a data URL
-- (about 20-40 KB). That keeps it to one row the profile already loads, with no storage bucket to set up.
-- The length cap stops anything larger getting in.

alter table profiles
  add column theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  add column accent text not null default 'violet' check (accent in ('violet', 'blue', 'teal', 'green', 'rose', 'orange')),
  add column avatar text check (avatar is null or length(avatar) <= 90000);
