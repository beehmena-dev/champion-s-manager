// Cores de uniforme padrão pra clubes sem cor definida (import antigo, ou
// fonte do seed sem essa informação). Hash determinístico pelo nome/id, pra
// o mesmo clube sempre cair na mesma cor dentro de um save — nunca aleatório
// de verdade, senão trocaria a cada re-render.
const PALETTE = [
  "#dc2626", "#2563eb", "#16a34a", "#000000", "#ffffff",
  "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#78716c",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function defaultClubColors(seed: string): { primary: string; secondary: string } {
  return {
    primary: PALETTE[hash(seed) % PALETTE.length],
    secondary: PALETTE[hash(seed + "s") % PALETTE.length],
  };
}

// Preto ou branco, o que tiver mais contraste sobre `bg` (hex #rgb/#rrggbb).
// Pra texto/números em cima do token do jogador na cor do clube.
export function contrastText(bg: string): string {
  let h = bg.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  // luminância relativa (aproximação sRGB)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b0f19" : "#ffffff";
}

// Resolve a cor real do clube (se importada) com fallback pro hash — usar em
// qualquer lugar que precise de cor de uniforme (visualizador 3D, escudos
// placeholder etc.) em vez de assumir que o campo nunca é nulo.
export function clubColors(club: { id: string; primary_color?: string | null; secondary_color?: string | null }): {
  primary: string;
  secondary: string;
} {
  const fallback = defaultClubColors(club.id);
  return {
    primary: club.primary_color ?? fallback.primary,
    secondary: club.secondary_color ?? fallback.secondary,
  };
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

/** Distância simples entre duas cores (0-441). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Uniforme do visitante no campo 2D. Quando as duas camisas são parecidas
 * (Flamengo × Internacional, os dois vermelhos), o FM manda o visitante de
 * uniforme alternativo — sem isso, as fichas dos dois times ficam idênticas e
 * é impossível acompanhar a partida. Tenta a cor secundária do visitante e,
 * se ela também conflitar, cai em branco ou preto.
 */
export function awayKitColor(homePrimary: string, awayPrimary: string, awaySecondary: string): string {
  const MIN = 90;
  if (colorDistance(homePrimary, awayPrimary) >= MIN) return awayPrimary;
  if (colorDistance(homePrimary, awaySecondary) >= MIN) return awaySecondary;
  return colorDistance(homePrimary, "#ffffff") >= MIN ? "#ffffff" : "#111827";
}
