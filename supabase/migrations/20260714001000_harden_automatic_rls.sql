-- The automatic-RLS option creates this SECURITY DEFINER helper in public.
-- Event triggers do not need browser-facing roles to execute it directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
