-- Cláusula de compra opcional em empréstimos (o clube que pega emprestado
-- pode pagar essa taxa a qualquer momento pra tornar a transferência
-- definitiva) — ver src/lib/transfer-offers.ts (exerciseLoanBuyOption).
ALTER TABLE public.transfer_offers ADD COLUMN loan_buy_option BIGINT;
ALTER TABLE public.players ADD COLUMN loan_buy_option BIGINT;
