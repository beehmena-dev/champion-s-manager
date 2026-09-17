-- Sondagens de emprego: clube de reputação maior propõe contratar o técnico
-- (usuário) quando ele está indo bem no clube atual — ver src/game/job-offers.ts.
CREATE TABLE public.job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  offering_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | expired
  offer_date DATE NOT NULL,
  expires_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.job_offers(save_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_offers TO authenticated;
GRANT ALL ON public.job_offers TO service_role;
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_offers_own" ON public.job_offers FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
