-- Atributos de jogador no padrão Football Manager (47 campos, escala 1-20
-- cada) substituindo o conjunto simplificado de 12 que existia antes — ver
-- src/game/attributes.ts. Uma coluna jsonb em vez de 47 colunas soltas:
-- mais sustentável pra iterar (não precisa de migration pra cada ajuste de
-- peso/atributo) e casa com o padrão já usado em position_progress/injury_history.
ALTER TABLE public.players ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- As 12 colunas antigas (finishing, passing, tackling, pace, stamina,
-- dribbling, heading, vision, positioning, gk_reflexes, gk_handling,
-- gk_positioning) ficam por enquanto — dropadas numa migration separada
-- depois que o backfill de "attributes" pra todo jogador existente rodar e
-- for confirmado (ver script de backfill executado nesta sessão). Remover
-- antes disso quebraria qualquer leitura antiga em voo.
