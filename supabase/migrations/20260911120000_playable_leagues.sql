-- Ligas jogáveis vs. segundo plano.
--
-- competitions.playable = a competição roda com simulação COMPLETA (jogadores
--   evoluem atributo a atributo dia a dia, virada de temporada detalhada).
-- competitions.playable = false -> simulação LEVE: resultados/tabela/mercado
--   seguem, mas as partidas usam só a força média do elenco (clubs.strength) e
--   a virada de temporada roda inteira no servidor (rollover_background_players).
--
-- clubs.strength = overall médio do elenco (top 18), em cache — o motor usa
-- isso pra simular/rolar ligas de segundo plano sem carregar os jogadores.

ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS playable boolean NOT NULL DEFAULT true;

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS strength integer;

-- Virada de temporada das ligas de segundo plano, 100% no servidor (uma
-- chamada em vez de dezenas de milhares de round-trips do PostgREST):
--   * +1 ano de idade, zera forma/condição/estatísticas de temporada
--   * deriva leve de overall (jovem sobe, veterano cai)
--   * contratos vencidos: 70% renova sozinho, 30% vira agente livre
--   * aposenta parte dos 34+
--   * recalcula clubs.strength de TODOS os clubes do save
CREATE OR REPLACE FUNCTION public.rollover_background_players(
  p_save_id uuid,
  p_next_season_start date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  bg_clubs uuid[];
BEGIN
  SELECT array_agg(c.id) INTO bg_clubs
  FROM clubs c
  JOIN competitions comp ON comp.id = c.competition_id
  WHERE c.save_id = p_save_id AND comp.playable = false;

  IF bg_clubs IS NOT NULL THEN
    -- aposenta veteranos
    DELETE FROM players
    WHERE save_id = p_save_id AND club_id = ANY(bg_clubs)
      AND age >= 34 AND random() < 0.35;

    -- contratos vencidos: 30% vira agente livre
    UPDATE players
    SET club_id = NULL
    WHERE save_id = p_save_id AND club_id = ANY(bg_clubs)
      AND contract_until IS NOT NULL AND contract_until <= p_next_season_start
      AND random() < 0.30;

    -- os demais vencidos renovam sozinhos
    UPDATE players
    SET contract_until = (p_next_season_start + ((2 + floor(random() * 3)) * interval '365 days'))::date,
        wage = round(wage * (1 + random() * 0.15))
    WHERE save_id = p_save_id AND club_id = ANY(bg_clubs)
      AND contract_until IS NOT NULL AND contract_until <= p_next_season_start;

    -- envelhecimento + deriva de overall + reset de temporada
    UPDATE players
    SET age = age + 1,
        form = 65,
        condition = 100,
        goals_season = 0,
        appearances_season = 0,
        yellow_cards_season = 0,
        overall = greatest(20, least(97, overall +
          CASE
            WHEN age + 1 <= 22 THEN floor(random() * 2.5)::int
            WHEN age + 1 >= 31 THEN -floor(random() * 2.5)::int
            ELSE 0
          END)),
        market_value = greatest(0, round(market_value * (
          CASE
            WHEN age + 1 <= 22 THEN 1.06
            WHEN age + 1 >= 31 THEN 0.80
            ELSE 0.97
          END)))
    WHERE save_id = p_save_id AND club_id = ANY(bg_clubs);
  END IF;

  -- recalcula a força média (top 18) de TODOS os clubes do save
  UPDATE clubs c
  SET strength = sub.avg_ovr
  FROM (
    SELECT club_id, round(avg(overall))::int AS avg_ovr
    FROM (
      SELECT club_id, overall,
             row_number() OVER (PARTITION BY club_id ORDER BY overall DESC) AS rn
      FROM players
      WHERE save_id = p_save_id AND club_id IS NOT NULL
    ) ranked
    WHERE rn <= 18
    GROUP BY club_id
  ) sub
  WHERE c.id = sub.club_id AND c.save_id = p_save_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rollover_background_players(uuid, date) TO authenticated, anon, service_role;
