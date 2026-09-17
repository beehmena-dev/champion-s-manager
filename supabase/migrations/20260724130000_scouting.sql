-- Scouting: conhecimento acumulado por olheiro sobre cada jogador (além do
-- "conhecimento público" calculado em tempo real a partir da reputação do
-- clube e do overall — ver src/game/scouting.ts).
ALTER TABLE public.players ADD COLUMN scout_knowledge INT NOT NULL DEFAULT 0;

CREATE TABLE public.scouting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | cancelled
  started_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.scouting_assignments(save_id);
CREATE INDEX ON public.scouting_assignments(club_id);
CREATE UNIQUE INDEX scouting_assignments_one_active_per_player ON public.scouting_assignments(club_id, player_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scouting_assignments TO authenticated;
GRANT ALL ON public.scouting_assignments TO service_role;
ALTER TABLE public.scouting_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouting_assignments_own" ON public.scouting_assignments FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
