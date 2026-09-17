-- Cláusula de rescisão: valor fixo opcional definido na renovação de
-- contrato — qualquer clube que pague esse valor leva o jogador na hora,
-- sem negociação. contract_offers.release_clause guarda o valor proposto
-- durante a negociação salarial (sobrevive a contrapropostas de salário);
-- players.release_clause é o valor VIGENTE no contrato atual — ver
-- src/lib/contract-offers.ts e src/lib/release-clauses.ts.
ALTER TABLE public.players ADD COLUMN release_clause BIGINT;
ALTER TABLE public.contract_offers ADD COLUMN release_clause BIGINT;
