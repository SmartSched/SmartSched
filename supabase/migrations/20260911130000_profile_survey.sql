-- Onboarding survey answers live on the profile. survey stays null until the student
-- finishes the survey for the first time, which is what sends them into it on login.

alter table profiles
  add column survey jsonb,
  add column survey_updated_at timestamptz;
