-- Team Fluidity (Fluido/Estruturado — ver src/game/live-positions.ts, efeito
-- só no posicionamento, nunca no motor estatístico) + override temporário de
-- tática "só pra próxima partida" (ver src/lib/live-match.ts): um snapshot
-- completo (mesmo shape de TacticPreset em tactics.tsx) que some sozinho
-- depois que a partida do usuário é resolvida (src/lib/advance-day.ts).
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS team_fluidity text NOT NULL DEFAULT 'structured';
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS pending_override jsonb DEFAULT NULL;
