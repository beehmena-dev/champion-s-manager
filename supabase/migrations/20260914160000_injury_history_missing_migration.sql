-- Bug real encontrado ao verificar o item 06 do backlog FootSim: a coluna
-- `players.injury_history` (histórico combinado de lesões, usado em
-- medical.tsx, players.$playerId.tsx e advance-day.ts::buildInjuryPatch) já
-- tinha tipo gerado em src/integrations/supabase/types.ts e já era escrita/
-- lida em produção — mas a migration que a criou nunca foi salva em
-- supabase/migrations/. Um banco novo (instalação limpa do app desktop)
-- nunca teria essa coluna e quebraria advance-day.ts todo fim de temporada
-- ou processamento de lesão. Capturando agora como migration real.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS injury_history jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
