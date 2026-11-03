-- Supabase advisor 0011: pin the search_path of the append-only trigger, like every other function.
alter function public.credit_ledger_no_update() set search_path = '';
