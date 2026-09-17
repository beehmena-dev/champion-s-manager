-- Perfil do técnico: nome e reputação PESSOAL (separada da confiança da
-- diretoria do clube atual — clubs.board_confidence — e da reputação do
-- clube — clubs.reputation). Fica no save porque acompanha o usuário
-- através de toda a carreira, mesmo trocando de clube — ver
-- src/game/board.ts (managerReputationDelta) e src/lib/season-rollover.ts.
ALTER TABLE public.saves ADD COLUMN manager_name TEXT NOT NULL DEFAULT 'Técnico';
ALTER TABLE public.saves ADD COLUMN manager_reputation INT NOT NULL DEFAULT 50;
