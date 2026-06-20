-- Embeddings → modello Supabase gte-small (384 dim), usato in scrittura e query.
-- La tabella embeddings è vuota: cambio dimensione e ricreo indice/funzioni.

drop index if exists public.embeddings_vec_idx;
alter table public.embeddings
  alter column embedding type extensions.vector(384);
create index embeddings_vec_idx on public.embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- match per il client (RLS: filtra su auth.uid())
drop function if exists public.match_embeddings(extensions.vector, integer);
create or replace function public.match_embeddings(
  query_embedding extensions.vector(384),
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

-- match per service-role (MCP): owner passato esplicitamente. security definer +
-- search_path bloccato per sicurezza.
create or replace function public.match_embeddings_for(
  owner uuid,
  query_embedding extensions.vector(384),
  match_count int default 8
)
returns table (
  id uuid,
  meeting_id uuid,
  kind text,
  content text,
  similarity float
)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.meeting_id, e.kind, e.content,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  where e.owner_id = owner
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
