-- Caixa de entrada unificada — mensagens da diretoria, imprensa, departamento
-- médico, mercado, base e resultados. Geradas ao avançar os dias (ver
-- src/lib/inbox.ts e os pontos de integração em src/lib/advance-day.ts e
-- src/lib/ai-transfers.ts). A tela fica em src/routes/.../saves.$saveId.news.tsx.
CREATE TABLE public.inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,        -- board | press | medical | transfer | result | youth | contract | general
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,                     -- rota relativa pra ação (ex. /saves/<id>/market)
  link_label TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  game_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.inbox_messages(save_id, club_id, created_at DESC);
CREATE INDEX ON public.inbox_messages(save_id, club_id, read);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_messages TO authenticated;
GRANT ALL ON public.inbox_messages TO service_role;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_messages_own" ON public.inbox_messages
  FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
