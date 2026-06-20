-- "Automatically expose new tables" è OFF sul progetto → le tabelle create via
-- migration non hanno privilegi per i ruoli della Data API. RLS filtra le RIGHE ma
-- serve comunque il GRANT base sul ruolo. Concediamo l'accesso al solo ruolo
-- `authenticated` (utenti loggati); `anon` resta senza accesso. `service_role`
-- (usato dall'Edge Function MCP) ha già tutti i privilegi.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.templates,
  public.meetings,
  public.transcript_segments,
  public.raw_notes,
  public.enhanced_notes,
  public.embeddings,
  public.api_tokens
to authenticated;

grant execute on function public.match_embeddings(extensions.vector, integer) to authenticated;
