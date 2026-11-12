-- Monthly repeats can occur on a calendar date (for example, the 15th) or an ordinal weekday
-- (for example, the first Monday). Existing repeat rules remain weekly.
alter table time_block_series
  add column recurrence_type text not null default 'weekly'
    check (recurrence_type in ('weekly', 'monthly_date', 'monthly_weekday')),
  add column day_of_month smallint check (day_of_month between 1 and 31),
  add column week_of_month smallint check (week_of_month between 1 and 5),
  add column weekday smallint check (weekday between 0 and 6);
