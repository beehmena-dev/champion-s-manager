-- Comissão técnica: treinador (acelera evolução de atributos em treino),
-- preparador físico (acelera recuperação de condição) e olheiro-chefe
-- (acelera scouting e libera mais vagas simultâneas — ver src/game/staff.ts
-- e src/game/scouting.ts). club_id NULL = candidato disponível no mercado.
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'coach' | 'fitness_coach' | 'chief_scout'
  skill INT NOT NULL DEFAULT 10, -- 1-20
  wage INT NOT NULL DEFAULT 0,   -- quinzenal, mesmo padrão de players.wage
  hired_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.staff(save_id);
CREATE INDEX ON public.staff(club_id);
CREATE UNIQUE INDEX staff_one_per_role_per_club ON public.staff(club_id, role) WHERE club_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_own" ON public.staff FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

-- Foco de treino do clube — ver src/game/training.ts pros efeitos de cada foco.
ALTER TABLE public.clubs ADD COLUMN training_focus TEXT NOT NULL DEFAULT 'balanced';
