-- Captura como migration real duas coisas que já existiam no banco de dev,
-- mas só tinham sido adicionadas ad-hoc em sessões anteriores (nunca
-- viraram SQL versionado) — achado ao recriar o banco do zero e a
-- importação de seed quebrar com "Could not find the 'position_progress'
-- column" (PGRST204). Sem isso, qualquer instalação NOVA do app (banco
-- criado do zero na 1ª execução, ver scripts/local-db-server.mjs::ensureSchema)
-- bate no mesmo erro ao tentar importar uma base.

-- players.position_progress: progresso de familiaridade por posição
-- (jsonb, {"<posição>": 0-100}) — usado por src/game/development.ts
-- (evolução ao longo das partidas) e src/game/tactics.ts (estimativa de
-- familiaridade quando ainda não jogou naquela posição, feature f7-tacticsfm).
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS position_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- seed_library: bases importadas ficam salvas por usuário, pra não
-- precisar reenviar o mesmo seed.json a cada save novo (ver
-- src/lib/seed-library.ts). Mesmo padrão de RLS de "saves"/"profiles":
-- cada usuário só vê/mexe na própria biblioteca.
CREATE TABLE IF NOT EXISTS public.seed_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  seed JSONB NOT NULL,
  clubs_count INTEGER NOT NULL DEFAULT 0,
  players_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seed_library TO authenticated;
GRANT ALL ON public.seed_library TO service_role;
ALTER TABLE public.seed_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_seed_library" ON public.seed_library FOR ALL USING (public.current_uid() = user_id) WITH CHECK (public.current_uid() = user_id);

NOTIFY pgrst, 'reload schema';
