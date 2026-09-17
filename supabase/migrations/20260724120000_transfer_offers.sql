-- Propostas de transferência em negociação (multi-rodada), separado da
-- tabela `transfers` que segue sendo só o histórico de negócios FECHADOS.
CREATE TABLE public.transfer_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  seller_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  buyer_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  initiator TEXT NOT NULL,          -- 'user' | 'ai' — quem abriu a negociação
  current_fee BIGINT NOT NULL,      -- valor atualmente na mesa
  last_actor TEXT NOT NULL,         -- 'user' | 'ai' — quem fez o último movimento (o OUTRO lado responde)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | rejected | expired
  rounds INT NOT NULL DEFAULT 1,
  expires_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transfer_offers(save_id);
CREATE INDEX ON public.transfer_offers(seller_club_id);
CREATE INDEX ON public.transfer_offers(buyer_club_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_offers TO authenticated;
GRANT ALL ON public.transfer_offers TO service_role;
ALTER TABLE public.transfer_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfer_offers_own" ON public.transfer_offers FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
