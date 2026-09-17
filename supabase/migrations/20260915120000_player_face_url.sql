-- Foto real de jogador (mesmo princípio de clubs.crest_url) — null até o
-- import trazer valor real (scripts/import-player-faces.mjs), fallback
-- procedural fica no cliente (src/components/player-face.tsx).
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS face_url TEXT;
NOTIFY pgrst, 'reload schema';
