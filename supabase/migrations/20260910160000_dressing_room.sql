-- Dinâmica do vestiário — data da última conversa individual do técnico com o
-- jogador (cooldown de 10 dias de jogo entre conversas). Hierarquia e clima são
-- derivados dos atributos/moral em tempo real, não precisam de coluna.
-- Ver src/game/dressing-room.ts e src/lib/dressing-room.ts.
ALTER TABLE public.players ADD COLUMN last_talk_date DATE;
