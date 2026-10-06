-- Légendes du Dimanche — cards and pack openings (Phase 4, slice 1).
-- `card_defs` lists the cards that exist (public, filled by the seed); `card_items` are the cards a
-- player owns. A card's picture is never stored: it is recomputed from its id. Opening a pack is a
-- server-only write that checks the cards exist and is replayable by its request id.

create table public.card_defs (
  id text primary key check (id ~ '^.+-\d{4}-\d{2}-\d{2}(~[a-z-]+)?$'),
  player_id text not null,
  variant text not null check (variant in ('base', 'weekend', 'former-pro')),
  class text not null check (class in (
    'bronze-common', 'bronze-rare', 'silver-common', 'silver-rare',
    'gold-common', 'gold-rare', 'former-pro', 'weekend'
  )),
  rating smallint not null check (rating between 1 and 99),
  club_id text not null references public.clubs (id),
  position text not null
);
create index card_defs_club_idx on public.card_defs (club_id);
alter table public.card_defs enable row level security;
revoke all on public.card_defs from anon, authenticated;
grant select on public.card_defs to anon, authenticated;
create policy card_defs_select_all on public.card_defs for select to anon, authenticated using (true);

-- What was drawn for a pack, with its seed: any opening can be redrawn with `openPack` to audit it.
create table public.pack_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pack_id uuid not null unique references public.user_packs (id),
  type text not null,
  seed text not null,
  cards text[] not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
alter table public.pack_openings enable row level security;
revoke all on public.pack_openings from anon, authenticated;
grant select on public.pack_openings to authenticated;
create policy pack_openings_select_own on public.pack_openings
  for select to authenticated using (user_id = (select auth.uid()));

create table public.card_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null references public.card_defs (id),
  source text not null check (source in ('pack')),
  opening_id uuid references public.pack_openings (id),
  created_at timestamptz not null default now()
);
create index card_items_user_idx on public.card_items (user_id, created_at);
alter table public.card_items enable row level security;
revoke all on public.card_items from anon, authenticated;
grant select on public.card_items to authenticated;
create policy card_items_select_own on public.card_items
  for select to authenticated using (user_id = (select auth.uid()));

-- Opens a closed pack with the cards the server drew. Atomic: either every card is added and the
-- pack is marked open, or nothing changes. Asking again with the same request returns the cards
-- already recorded.
create function public.open_pack(
  p_user uuid, p_pack uuid, p_seed text, p_cards text[], p_request uuid
) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  pack public.user_packs;
  previous public.pack_openings;
  opening uuid;
  expected integer;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  select * into previous from public.pack_openings where user_id = p_user and request_id = p_request;
  if found then return previous.cards; end if;
  select * into pack from public.user_packs where id = p_pack and user_id = p_user;
  if not found then raise exception 'pack_not_found'; end if;
  if pack.opened_at is not null then raise exception 'pack_already_opened'; end if;
  if coalesce(array_length(p_cards, 1), 0) = 0 then raise exception 'empty_pack'; end if;
  expected := case pack.type when 'starter' then 18 else 12 end;
  if array_length(p_cards, 1) <> expected then raise exception 'wrong_card_count'; end if;
  if exists (
    select 1 from unnest(p_cards) as c (id)
    where not exists (select 1 from public.card_defs d where d.id = c.id)
  ) then
    raise exception 'unknown_card';
  end if;
  insert into public.pack_openings (user_id, pack_id, type, seed, cards, request_id)
  values (p_user, p_pack, pack.type, p_seed, p_cards, p_request) returning id into opening;
  insert into public.card_items (user_id, card_id, source, opening_id)
  select p_user, c.id, 'pack', opening from unnest(p_cards) as c (id);
  update public.user_packs set opened_at = now() where id = p_pack;
  return p_cards;
end $$;

revoke execute on function public.open_pack(uuid, uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.open_pack(uuid, uuid, text, text[], uuid) to service_role;
