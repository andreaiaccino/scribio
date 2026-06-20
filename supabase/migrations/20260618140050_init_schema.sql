-- Scribio — schema cloud Fase 1 (Supabase / Postgres + pgvector).
-- Multi-utente: ogni riga è di proprietà di un utente (auth.users) → RLS isola i dati.
-- Mirror cloud dello schema desktop (SQLite), sincronizzato (solo TESTO, mai audio).
-- Decisioni: timestamptz; owner_id = auth.uid(); embeddings vector(1536) per
-- OpenAI text-embedding-3-small; template per-utente (condivisione = step successivo).

-- ---------------------------------------------------------------------------
-- Estensioni
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;       -- pgvector (RAG)
create extension if not exists pgcrypto with schema extensions;     -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- templates (per-utente)
-- ---------------------------------------------------------------------------
create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  type        text,
  prompt      text not null,
  structure   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index templates_owner_idx on public.templates(owner_id);
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title         text not null,
  template_id   uuid references public.templates(id) on delete set null,
  language      text not null default 'it',
  status        text not null check (status in
                  ('recording','transcribing','enhancing','ready','error')),
  started_at    timestamptz not null,
  ended_at      timestamptz,
  participants  jsonb not null default '[]'::jsonb,
  consent_flag  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meetings_owner_started_idx on public.meetings(owner_id, started_at desc);
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transcript_segments
-- ---------------------------------------------------------------------------
create table public.transcript_segments (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  speaker     text not null check (speaker in ('me','others')),
  ts_start    real not null,
  ts_end      real,
  text        text not null,
  seq         integer not null
);
create index segments_meeting_idx on public.transcript_segments(meeting_id, seq);

-- ---------------------------------------------------------------------------
-- raw_notes (1:1 con meeting)
-- ---------------------------------------------------------------------------
create table public.raw_notes (
  meeting_id  uuid primary key references public.meetings(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  content_md  text not null default '',
  updated_at  timestamptz not null default now()
);
create trigger raw_notes_updated_at before update on public.raw_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- enhanced_notes (1:1 con meeting) — niente action items (rimossi dal prodotto)
-- ---------------------------------------------------------------------------
create table public.enhanced_notes (
  meeting_id  uuid primary key references public.meetings(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  content_md  text not null,
  summary     text,
  model       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- embeddings (RAG: ricerca semantica + Ask globale)
-- kind: 'enhanced' | 'transcript' | 'raw'. Un meeting → N chunk.
-- ---------------------------------------------------------------------------
create table public.embeddings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  kind        text not null check (kind in ('enhanced','transcript','raw')),
  content     text not null,
  embedding   extensions.vector(1536),               -- OpenAI text-embedding-3-small
  created_at  timestamptz not null default now()
);
create index embeddings_meeting_idx on public.embeddings(meeting_id);
-- ricerca per similarità coseno (HNSW)
create index embeddings_vec_idx on public.embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS: ogni utente vede/scrive SOLO le proprie righe
-- ---------------------------------------------------------------------------
alter table public.templates            enable row level security;
alter table public.meetings             enable row level security;
alter table public.transcript_segments  enable row level security;
alter table public.raw_notes            enable row level security;
alter table public.enhanced_notes       enable row level security;
alter table public.embeddings           enable row level security;

create policy owner_all on public.templates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.meetings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.transcript_segments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.raw_notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.enhanced_notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.embeddings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- match_embeddings: ricerca semantica top-k filtrata per utente (per MCP/Ask globale)
-- ---------------------------------------------------------------------------
create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  meeting_id uuid,
  kind text,
  content text,
  similarity float
)
language sql stable as $$
  select e.id, e.meeting_id, e.kind, e.content,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  where e.owner_id = auth.uid()
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
