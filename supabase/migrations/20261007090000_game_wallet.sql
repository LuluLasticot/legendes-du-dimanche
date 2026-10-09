-- Légendes du Dimanche — the game's wallet (Phase 4, slice 1): profiles, credit ledger, packs to open.
-- Rule 2: everything of value is written by the server only. A signed-in player (guest included)
-- can READ his own rows; there is no insert, update or delete policy for him at all. Writes go
-- through the SECURITY DEFINER functions below, executable by the service role alone.

-- ─── Profiles ────────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 3 and 24),
  club_id text references public.clubs (id),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Every account, anonymous ones included, gets a profile with a placeholder pseudo.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, pseudo)
  values (new.id, 'Joueur-' || substr(replace(new.id::text, '-', ''), 1, 6));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Credit ledger ───────────────────────────────────────────────────────────────────────────
-- No balance is ever written: it is the sum of the ledger. Lines are never changed.

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('welcome', 'pack', 'match', 'objective')),
  ref text,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, id);
create unique index credit_ledger_welcome_once on public.credit_ledger (user_id) where reason = 'welcome';
create unique index credit_ledger_ref_once on public.credit_ledger (user_id, reason, ref) where ref is not null;
alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated using (user_id = (select auth.uid()));

create function public.credit_ledger_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'credit_ledger is append-only';
end $$;
create trigger credit_ledger_no_update before update on public.credit_ledger
  for each row execute function public.credit_ledger_no_update();

create view public.wallet_balances with (security_invoker = on) as
  select p.id as user_id, coalesce(sum(l.delta), 0)::integer as balance
  from public.profiles p
  left join public.credit_ledger l on l.user_id = p.id
  group by p.id;
revoke all on public.wallet_balances from anon, authenticated;
grant select on public.wallet_balances to authenticated;

-- ─── Packs waiting to be opened ──────────────────────────────────────────────────────────────

create table public.user_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('starter', 'bronze', 'silver', 'gold', 'gold-premium')),
  source text not null check (source in ('starter', 'shop', 'objective')),
  request_id uuid,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_packs_user_idx on public.user_packs (user_id, created_at);
create unique index user_packs_request_once on public.user_packs (user_id, request_id) where request_id is not null;
create unique index user_packs_starter_once on public.user_packs (user_id) where source = 'starter';
alter table public.user_packs enable row level security;
revoke all on public.user_packs from anon, authenticated;
grant select on public.user_packs to authenticated;
create policy user_packs_select_own on public.user_packs
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Writes: service role only ───────────────────────────────────────────────────────────────

-- The welcome bonus, once per player, however many tabs ask at the same time.
create function public.claim_welcome(p_user uuid, p_amount integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  paid integer;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  insert into public.credit_ledger (user_id, delta, reason)
  values (p_user, p_amount, 'welcome')
  on conflict (user_id) where reason = 'welcome' do nothing;
  get diagnostics paid = row_count;
  return paid * p_amount;
end $$;

-- The club a new player starts with: any club of the pilot, chosen once, and the starter pack that
-- goes with it in the same transaction (a player with a club and no pack cannot exist). Asking
-- again for the same club, after a lost answer, returns the same pack. Returns the pack's id.
create function public.choose_club(p_user uuid, p_club text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  chosen text;
  pack uuid;
begin
  select club_id into chosen from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if chosen is not null then
    if chosen <> p_club then raise exception 'club_already_chosen'; end if;
  else
    if not exists (select 1 from public.clubs where id = p_club) then
      raise exception 'club_not_eligible';
    end if;
    update public.profiles set club_id = p_club where id = p_user;
  end if;
  select id into pack from public.user_packs where user_id = p_user and source = 'starter';
  if not found then
    insert into public.user_packs (user_id, type, source) values (p_user, 'starter', 'starter')
    returning id into pack;
  end if;
  return pack;
end $$;

-- Gives a closed pack to a player, paying for it from his credits when it has a price. One
-- transaction: the profile row is locked first, so two purchases at once cannot spend the same
-- credits twice. Asking again with the same request returns the same pack.
create function public.grant_pack(
  p_user uuid, p_type text, p_source text, p_price integer, p_request uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
  chosen text;
  balance integer;
  new_id uuid;
begin
  select club_id into chosen from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if (p_source = 'starter') <> (p_type = 'starter') then raise exception 'invalid_pack'; end if;
  if p_price is null or p_price < 0 then raise exception 'invalid_price'; end if;
  if p_request is not null then
    select id into existing from public.user_packs where user_id = p_user and request_id = p_request;
    if found then return existing; end if;
  end if;
  if p_source = 'starter' then
    select id into existing from public.user_packs where user_id = p_user and source = 'starter';
    if found then return existing; end if;
    if chosen is null then raise exception 'club_not_chosen'; end if;
  end if;
  if p_price > 0 then
    select coalesce(sum(delta), 0) into balance from public.credit_ledger where user_id = p_user;
    if balance < p_price then raise exception 'insufficient_funds'; end if;
  end if;
  insert into public.user_packs (user_id, type, source, request_id)
  values (p_user, p_type, p_source, p_request) returning id into new_id;
  if p_price > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref) values (p_user, -p_price, 'pack', new_id::text);
  end if;
  return new_id;
end $$;

revoke execute on function
  public.claim_welcome(uuid, integer),
  public.choose_club(uuid, text),
  public.grant_pack(uuid, text, text, integer, uuid)
from public, anon, authenticated;
grant execute on function
  public.claim_welcome(uuid, integer),
  public.choose_club(uuid, text),
  public.grant_pack(uuid, text, text, integer, uuid)
to service_role;
