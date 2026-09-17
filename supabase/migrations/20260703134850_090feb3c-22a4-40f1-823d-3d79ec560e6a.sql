
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile" ON public.profiles FOR ALL USING (public.current_uid() = id) WITH CHECK (public.current_uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TABLE public.saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  game_date DATE NOT NULL DEFAULT '2025-01-15',
  my_club_id UUID,
  seeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saves TO authenticated;
GRANT ALL ON public.saves TO service_role;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_saves" ON public.saves FOR ALL USING (public.current_uid() = user_id) WITH CHECK (public.current_uid() = user_id);

CREATE OR REPLACE FUNCTION public.owns_save(_save_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.saves WHERE id = _save_id AND user_id = public.current_uid());
$$;

CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'league',
  season INT NOT NULL DEFAULT 2025,
  current_round INT NOT NULL DEFAULT 0,
  total_rounds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.competitions(save_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitions_own" ON public.competitions FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

CREATE TABLE public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES public.competitions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  crest_url TEXT,
  budget BIGINT NOT NULL DEFAULT 0,
  reputation INT NOT NULL DEFAULT 50,
  morale INT NOT NULL DEFAULT 70,
  stadium_capacity INT NOT NULL DEFAULT 20000,
  division INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.clubs(save_id);
CREATE INDEX ON public.clubs(competition_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubs TO authenticated;
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clubs_own" ON public.clubs FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

ALTER TABLE public.saves ADD CONSTRAINT saves_my_club_fk FOREIGN KEY (my_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  age INT NOT NULL DEFAULT 24,
  position TEXT NOT NULL DEFAULT 'MID',
  foot TEXT NOT NULL DEFAULT 'right',
  finishing INT NOT NULL DEFAULT 10,
  passing INT NOT NULL DEFAULT 10,
  tackling INT NOT NULL DEFAULT 10,
  pace INT NOT NULL DEFAULT 10,
  stamina INT NOT NULL DEFAULT 10,
  dribbling INT NOT NULL DEFAULT 10,
  heading INT NOT NULL DEFAULT 10,
  vision INT NOT NULL DEFAULT 10,
  positioning INT NOT NULL DEFAULT 10,
  gk_reflexes INT NOT NULL DEFAULT 5,
  gk_handling INT NOT NULL DEFAULT 5,
  gk_positioning INT NOT NULL DEFAULT 5,
  overall INT NOT NULL DEFAULT 50,
  market_value BIGINT NOT NULL DEFAULT 0,
  wage INT NOT NULL DEFAULT 0,
  contract_until DATE,
  morale INT NOT NULL DEFAULT 70,
  condition INT NOT NULL DEFAULT 100,
  form INT NOT NULL DEFAULT 7,
  injured_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.players(save_id);
CREATE INDEX ON public.players(club_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_own" ON public.players FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  match_date DATE NOT NULL,
  home_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  away_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  home_score INT,
  away_score INT,
  played BOOLEAN NOT NULL DEFAULT false,
  events JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.matches(save_id);
CREATE INDEX ON public.matches(competition_id, round);
CREATE INDEX ON public.matches(match_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_own" ON public.matches FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

CREATE TABLE public.finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  kind TEXT NOT NULL,
  amount BIGINT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.finance_entries(save_id);
CREATE INDEX ON public.finance_entries(club_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_own" ON public.finance_entries FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));

CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  from_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  to_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  fee BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  proposal_date DATE NOT NULL,
  resolved_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transfers(save_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_own" ON public.transfers FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
