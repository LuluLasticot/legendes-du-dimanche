-- Limits against scripted farming before the public opening (D-044): at most 20 matches started
-- per player per hour. (The minimum duration of a match is checked by the server, matches.ts.)

create or replace function public.create_match(
  p_user uuid, p_seed integer, p_setup jsonb, p_options jsonb, p_request uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  id uuid;
begin
  perform 1 from public.profiles where profiles.id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  select matches.id into id from public.matches
  where user_id = p_user and (status = 'created' or request_id = p_request)
  order by created_at desc limit 1;
  if id is not null then return id; end if;
  if (
    select count(*) from public.matches
    where user_id = p_user and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'too_many_matches';
  end if;
  insert into public.matches (user_id, seed, setup, options, request_id)
  values (p_user, p_seed, p_setup, p_options, p_request)
  returning matches.id into id;
  return id;
end $$;

revoke execute on function public.create_match(uuid, integer, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_match(uuid, integer, jsonb, jsonb, uuid) to service_role;
