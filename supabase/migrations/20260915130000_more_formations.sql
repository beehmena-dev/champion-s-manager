-- Mais formações táticas: 4-5-1, 3-4-3, 4-4-1-1, 5-4-1, 4-3-1-2.
-- ALTER TYPE ... ADD VALUE não pode rodar dentro de bloco de transação
-- explícito nem ser usado na mesma transação em que foi adicionado, mas como
-- statement solto (psql autocommita cada um) funciona normalmente.
ALTER TYPE public.formation ADD VALUE IF NOT EXISTS '4-5-1';
ALTER TYPE public.formation ADD VALUE IF NOT EXISTS '3-4-3';
ALTER TYPE public.formation ADD VALUE IF NOT EXISTS '4-4-1-1';
ALTER TYPE public.formation ADD VALUE IF NOT EXISTS '5-4-1';
ALTER TYPE public.formation ADD VALUE IF NOT EXISTS '4-3-1-2';
