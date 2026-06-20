-- Token API per l'accesso remoto via MCP (Hermes, e in futuro Claude.ai).
-- Si salva solo l'HASH del token (sha256 hex); il valore in chiaro è mostrato
-- una sola volta all'utente. La validazione lato Edge Function usa il service role.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name         text,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index api_tokens_owner_idx on public.api_tokens(owner_id);

alter table public.api_tokens enable row level security;

-- L'utente gestisce SOLO i propri token. La validazione del token (lookup per hash)
-- avviene via service role nell'Edge Function MCP (RLS bypassata di proposito).
create policy owner_all on public.api_tokens
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
