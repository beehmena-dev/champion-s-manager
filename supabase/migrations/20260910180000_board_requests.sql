-- Catálogo de pedidos à diretoria (estilo FM) — ver src/game/board.ts e
-- src/lib/board.ts. Níveis de instalação (1-5, 3 = padrão) e histórico de
-- pedidos (limita a 3 por temporada).
ALTER TABLE public.clubs ADD COLUMN training_facilities INT NOT NULL DEFAULT 3;
ALTER TABLE public.clubs ADD COLUMN youth_facilities INT NOT NULL DEFAULT 3;

CREATE TABLE public.board_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season INT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,       -- approved | rejected
  response TEXT NOT NULL DEFAULT '',
  game_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.board_requests(club_id, season);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_requests TO authenticated;
GRANT ALL ON public.board_requests TO service_role;
ALTER TABLE public.board_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_requests_own" ON public.board_requests
  FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
