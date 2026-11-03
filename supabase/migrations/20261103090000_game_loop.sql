-- Légendes du Dimanche — the game loop (Phase 4, plan C): matches checked by replay, objectives,
-- the saved eleven. Same rule as before: a player reads his own rows, the server writes.

-- ─── Matches ─────────────────────────────────────────────────────────────────────────────────
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed integer not null,
  setup jsonb not null,
  options jsonb not null,
  status text not null default 'created' check (status in ('created', 'validated', 'rejected')),
  score integer[] check (score is null or array_length(score, 1) = 2),
  moments_won integer check (moments_won is null or moments_won >= 0),
  reward integer check (reward is null or reward >= 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, request_id)
);
create index matches_user_idx on public.matches (user_id, created_at);
-- One match open at a time: no second seed to try while the first is unfinished.
create unique index matches_one_open on public.matches (user_id) where status = 'created';
alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;
create policy matches_select_own on public.matches
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Objectives ──────────────────────────────────────────────────────────────────────────────
create table public.objective_defs (
  id text primary key,
  chain text not null,
  position integer not null,
  condition text not null check (condition in ('match_played', 'squad_saved', 'pack_opened')),
  reward_pack text check (reward_pack in ('bronze', 'silver', 'gold', 'gold-premium')),
  reward_credits integer check (reward_credits > 0),
  check ((reward_pack is null) <> (reward_credits is null)),
  unique (chain, position)
);
alter table public.objective_defs enable row level security;
revoke all on public.objective_defs from anon, authenticated;
grant select on public.objective_defs to anon, authenticated;
create policy objective_defs_read on public.objective_defs for select using (true);

-- Les Fondations of the slice (starting values, to balance with packages/economy).
insert into public.objective_defs (id, chain, position, condition, reward_pack, reward_credits) values
  ('foundations-match', 'foundations', 1, 'match_played', 'bronze', null),
  ('foundations-squad', 'foundations', 2, 'squad_saved', null, 300),
  ('foundations-open', 'foundations', 3, 'pack_opened', 'bronze', null);

create table public.user_objectives (
  user_id uuid not null references public.profiles (id) on delete cascade,
  objective_id text not null references public.objective_defs (id),
  completed_at timestamptz not null default now(),
  primary key (user_id, objective_id)
);
alter table public.user_objectives enable row level security;
revoke all on public.user_objectives from anon, authenticated;
grant select on public.user_objectives to authenticated;
create policy user_objectives_select_own on public.user_objectives
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── The saved eleven ────────────────────────────────────────────────────────────────────────
create table public.user_squads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  formation text not null,
  lineup text[] not null check (array_length(lineup, 1) = 11),
  updated_at timestamptz not null default now()
);
alter table public.user_squads enable row level security;
revoke all on public.user_squads from anon, authenticated;
grant select on public.user_squads to authenticated;
create policy user_squads_select_own on public.user_squads
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Writes: service role only ───────────────────────────────────────────────────────────────

-- Completes every objective with this condition the player has not done yet, and pays it.
create function public.advance_objective(p_user uuid, p_condition text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  done integer := 0;
  inserted integer;
begin
  for d in select * from public.objective_defs where condition = p_condition order by chain, position loop
    insert into public.user_objectives (user_id, objective_id) values (p_user, d.id)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then continue; end if;
    done := done + 1;
    if d.reward_pack is not null then
      insert into public.user_packs (user_id, type, source) values (p_user, d.reward_pack, 'objective');
    else
      insert into public.credit_ledger (user_id, delta, reason, ref)
      values (p_user, d.reward_credits, 'objective', d.id);
    end if;
  end loop;
  return done;
end $$;

-- A match frozen by the server before it is played. The player's open match, if he has one, is
-- returned instead (two tabs at once included: the profile row is locked first).
create function public.create_match(
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
  insert into public.matches (user_id, seed, setup, options, request_id)
  values (p_user, p_seed, p_setup, p_options, p_request)
  returning matches.id into id;
  return id;
end $$;

-- The server's verdict on a played match (the replay is done in TypeScript): a valid match pays
-- its reward once and counts for the objectives; a rejected one pays nothing.
create function public.record_match(
  p_user uuid, p_match uuid, p_valid boolean, p_score integer[], p_moments_won integer, p_reward integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  select * into m from public.matches where id = p_match and user_id = p_user for update;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'created' then return 0; end if;
  if not p_valid then
    update public.matches set status = 'rejected', finished_at = now() where id = p_match;
    return 0;
  end if;
  if p_reward < 0 then raise exception 'invalid_amount'; end if;
  update public.matches
  set status = 'validated', score = p_score, moments_won = p_moments_won, reward = p_reward,
      finished_at = now()
  where id = p_match;
  if p_reward > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user, p_reward, 'match', p_match::text);
  end if;
  perform public.advance_objective(p_user, 'match_played');
  return p_reward;
end $$;

-- The player's eleven: eleven cards he owns, in the formation's order.
create function public.save_squad(p_user uuid, p_formation text, p_lineup text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(array_length(p_lineup, 1), 0) <> 11 then raise exception 'squad_incomplete'; end if;
  if exists (
    select 1 from unnest(p_lineup) as l(card_id)
    where not exists (
      select 1 from public.card_items i where i.user_id = p_user and i.card_id = l.card_id
    )
  ) then
    raise exception 'card_not_owned';
  end if;
  insert into public.user_squads (user_id, formation, lineup) values (p_user, p_formation, p_lineup)
  on conflict (user_id) do update set formation = excluded.formation, lineup = excluded.lineup,
    updated_at = now();
  perform public.advance_objective(p_user, 'squad_saved');
end $$;

revoke execute on function
  public.advance_objective(uuid, text),
  public.create_match(uuid, integer, jsonb, jsonb, uuid),
  public.record_match(uuid, uuid, boolean, integer[], integer, integer),
  public.save_squad(uuid, text, text[])
from public, anon, authenticated;
grant execute on function
  public.advance_objective(uuid, text),
  public.create_match(uuid, integer, jsonb, jsonb, uuid),
  public.record_match(uuid, uuid, boolean, integer[], integer, integer),
  public.save_squad(uuid, text, text[])
to service_role;
