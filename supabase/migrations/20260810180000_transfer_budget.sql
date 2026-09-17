-- Orçamento separado: transfer_budget (só gasto/recebido em taxas de
-- transferência/empréstimo) vs budget (caixa "operacional" — salários,
-- bilheteria, aportes gerais da diretoria). Migra 40% do caixa atual de
-- cada clube pro novo fundo, mantendo o poder de gasto total igual ao de
-- antes da mudança — ver src/lib/transfer-offers.ts, src/lib/ai-transfers.ts,
-- src/lib/board.ts.
ALTER TABLE public.clubs ADD COLUMN transfer_budget BIGINT NOT NULL DEFAULT 0;
UPDATE public.clubs SET
  transfer_budget = ROUND(budget * 0.4),
  budget = budget - ROUND(budget * 0.4);
