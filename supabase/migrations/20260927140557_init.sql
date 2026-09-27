-- Légendes du Dimanche — initial migration (Phase 0).
-- Intentionally empty: it anchors the migration history. The first schema (profiles, wallets,
-- credit_ledger, cards…) arrives with the features that need it, with RLS enabled on every
-- table and sensitive writes going through transactional SECURITY DEFINER functions.
select 1;
