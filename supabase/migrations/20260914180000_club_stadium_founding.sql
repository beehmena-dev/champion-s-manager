-- Nome/cidade do estádio real e ano de fundação do clube — não vêm da CSV do
-- FM Genie Scout (não tem essa coluna), puxados do openfootball/clubs
-- (github.com/openfootball/clubs, licença CC0) via scripts/fetch-stadiums.mjs.
-- Ficam NULL pros clubes que o openfootball não cobre (ex. Nigéria, hoje sem
-- dataset lá) ou que não casaram pelo nome — nunca inventado.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS stadium_name TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS stadium_city TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS founded_year INT;

NOTIFY pgrst, 'reload schema';
