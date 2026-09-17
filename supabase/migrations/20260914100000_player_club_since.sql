-- Química de elenco por tempo jogado junto (ver src/game/tactics.ts::squadChemistryMultiplier).
-- club_since fica NULL pra qualquer jogador importado via seed (não sabemos
-- a data real de chegada de um elenco FM24 importado, e não faz sentido
-- assumir "chegou hoje" pra um time que já jogava junto de verdade — NULL é
-- tratado como neutro, sem penalidade). Só passa a ter valor a partir de
-- transferência/empréstimo/geração de base daqui pra frente (ver
-- transfer-offers.ts, loans.ts, youth.ts).
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS club_since DATE;
