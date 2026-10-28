-- #31 Peer-testing consent: when the tester agreed, and which version of the consent text they saw (the
-- app asks again when the text changes). Both stay null until they agree.

alter table profiles
  add column consented_at timestamptz,
  add column consent_version text;

-- "Delete my account and data": removes the signed-in user from auth.users. profiles cascades from it, and
-- every other table (tasks, time_blocks, time_block_series, habits, reflections, schedule_events) cascades
-- from profiles, so nothing of theirs is left. security definer because users can't touch auth.users
-- themselves; it only ever deletes auth.uid(), so nobody can delete someone else.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
