CREATE OR REPLACE FUNCTION public.current_uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_uid() TO authenticated, anon, service_role, sandbox_exec;