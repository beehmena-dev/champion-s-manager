-- Negociação de renovação de contrato (multi-rodada, mesmo padrão de
-- transfer_offers). Sempre iniciada pelo usuário, sempre sobre um jogador
-- do próprio elenco — o "outro lado" é o empresário do jogador.
CREATE TABLE public.contract_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  current_wage BIGINT NOT NULL,   -- salário quinzenal na mesa
  contract_years INT NOT NULL,    -- duração proposta, em anos
  last_actor TEXT NOT NULL,       -- 'user' | 'agent'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | rejected | withdrawn
  rounds INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contract_offers(save_id);
CREATE INDEX ON public.contract_offers(player_id);
CREATE UNIQUE INDEX contract_offers_one_active_per_player ON public.contract_offers(player_id) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_offers TO authenticated;
GRANT ALL ON public.contract_offers TO service_role;
ALTER TABLE public.contract_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_offers_own" ON public.contract_offers FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
