-- 1.2: jogador insatisfeito pede pra sair — ver src/game/unrest.ts.
CREATE TABLE public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- 'low_morale' | 'contract_ending'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | listed | dismissed
  created_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transfer_requests(save_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_requests TO authenticated;
GRANT ALL ON public.transfer_requests TO service_role;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfer_requests_own" ON public.transfer_requests FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

-- 1.3: empréstimos — deal_type registra o tipo do negócio fechado (histórico
-- e exibição na tela de Mercado); o estado "em empréstimo" de fato vive no
-- jogador (loaned_from_club_id + loan_return_date), pra devolução automática
-- na data certa não depender de reconsultar transfer_offers — ver src/lib/loans.ts.
ALTER TABLE public.transfer_offers ADD COLUMN deal_type TEXT NOT NULL DEFAULT 'permanent'; -- 'permanent' | 'loan'
ALTER TABLE public.players ADD COLUMN loaned_from_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL;
ALTER TABLE public.players ADD COLUMN loan_return_date DATE;
