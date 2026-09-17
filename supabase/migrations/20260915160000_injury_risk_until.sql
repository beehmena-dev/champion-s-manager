-- Migrações faltando achadas ao verificar item 19 do backlog FootSim: as
-- colunas `players.injury_risk_until` (janela de risco de recaída) e
-- `players.injury_type` (tipo da lesão atual, ver
-- src/game/medical.ts::buildInjuryPatch/rollRelapse) são lidas/escritas em
-- vários pontos do código (advance-day.ts, availability.ts, medical.ts, tela
-- de Central Médica) e já estão nos tipos gerados, mas nenhuma migration
-- jamais as criou — mesmo padrão recorrente já documentado em
-- project_missing_migrations.md (position_progress/seed_library/
-- injury_history, todos achados do mesmo jeito). Sem isso, TODO advanceDays
-- que processa uma lesão ou recaída falha com "column not found".
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS injury_risk_until DATE,
  ADD COLUMN IF NOT EXISTS injury_type TEXT;
