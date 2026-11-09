-- Shared `updated_at` trigger function for every mirrored table.
--
-- Why a server-side clock: pull asks "rows changed since my last successful pull",
-- so the ordering column must be monotonic per database, not per device. The client
-- sends `rev` (its own conflict counter) and the server stamps `updated_at`.
--
-- Deliberately `security invoker` (the default, stated explicitly) and with an empty
-- search_path: the body only assigns NEW and calls pg_catalog's `now()`, so it needs no
-- elevated rights and cannot be redirected by a search_path trick.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Stamps updated_at with the server clock on insert/update of a mirrored row.';
