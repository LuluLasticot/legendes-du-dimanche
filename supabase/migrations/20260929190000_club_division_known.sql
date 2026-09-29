-- A club's division is not always known: no open source gives the division of a district club, so
-- the pilot draws provisional ones (seeded) for a person to correct.
alter table public.clubs add column division_known boolean not null default false;
