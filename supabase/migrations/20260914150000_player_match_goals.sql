-- Item 06 do backlog FootSim: metas individuais por partida.
-- Array de {playerId, playerName, kind, threshold?} pra próxima partida do
-- usuário — some sozinho depois que a partida resolve (ver advance-day.ts),
-- mesmo padrão de "só a próxima partida" já usado em clubs.pending_override.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS player_match_goals jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
