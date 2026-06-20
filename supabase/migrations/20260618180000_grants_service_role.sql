-- L'Edge Function MCP gira come `service_role`. Con "auto-expose new tables" OFF
-- nemmeno service_role riceve privilegi sulle tabelle create via migration → la
-- lookup del token (api_tokens) falliva con permission denied, restituendo 401.
-- Concediamo i privilegi anche a service_role (oltre a BYPASSRLS che già possiede).

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.templates,
  public.meetings,
  public.transcript_segments,
  public.raw_notes,
  public.enhanced_notes,
  public.embeddings,
  public.api_tokens
to service_role;

grant execute on function public.match_embeddings_for(uuid, extensions.vector, integer) to service_role;
grant execute on function public.match_embeddings(extensions.vector, integer) to service_role;
