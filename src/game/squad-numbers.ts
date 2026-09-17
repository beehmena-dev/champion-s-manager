// -----------------------------------------------------------------------------
// Número da camisa. Não vem da base do FM (a CSV não traz), então é atribuído
// por nós: pilha de preferência por setor (goleiro puxa o 1, atacante o 9/10/7
// etc.) com fallback pro menor número livre. Determinístico dado o elenco.
// -----------------------------------------------------------------------------
type Pos = "GK" | "DEF" | "MID" | "FWD" | string;

const PREF: Record<"GK" | "DEF" | "MID" | "FWD", number[]> = {
  GK: [1, 12, 13, 25, 31, 40],
  DEF: [3, 4, 2, 5, 6, 15, 14, 16, 22, 24, 26, 33],
  MID: [8, 10, 6, 7, 16, 17, 18, 20, 21, 23, 28, 30],
  FWD: [9, 10, 7, 11, 17, 19, 20, 27, 29, 32, 39, 45],
};
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function basePos(p: Pos): "GK" | "DEF" | "MID" | "FWD" {
  return p === "GK" || p === "DEF" || p === "MID" || p === "FWD" ? p : "MID";
}

/** Menor número livre em 1..99 que não esteja em `used`. */
function lowestFree(used: Set<number>): number {
  for (let n = 1; n < 100; n++) if (!used.has(n)) return n;
  return 99;
}

/**
 * Um número livre pra uma contratação nova, respeitando a preferência do setor.
 */
export function nextSquadNumber(existing: (number | null | undefined)[], position: Pos): number {
  const used = new Set<number>(existing.filter((n): n is number => n != null));
  for (const n of PREF[basePos(position)]) if (!used.has(n)) return n;
  return lowestFree(used);
}

function prefRank(pos: Pos, n: number | null | undefined): number {
  if (n == null) return Infinity;
  const idx = PREF[basePos(pos)].indexOf(n);
  return idx === -1 ? Infinity : idx;
}

export interface NumberUpgradeSuggestion {
  playerId: string;
  currentNumber: number;
  suggestedNumber: number;
}

/**
 * Item 11 do backlog FootSim: "numeração dinâmica" — quando alguém sai do
 * elenco, o número dela fica livre e pode encaixar melhor em outro jogador
 * (ex. o 9 de um atacante que saiu combina mais com outro atacante que hoje
 * usa o 27). Não dispara em cima de um evento específico de saída — só olha
 * o elenco ATUAL e detecta o descompasso, o que cobre qualquer forma de
 * saída (transferência, liberação, aposentadoria) sem precisar plugar em
 * cada uma. Nunca aplica sozinho (mesmo padrão "sugerir, não aplicar" já
 * usado pros cobradores de bola parada) — só devolve candidatos, no máximo
 * 1 sugestão por jogador e por número (sem dois jogadores competindo pelo
 * mesmo número livre). Deliberadamente só 1 nível: um número que ficaria
 * livre POR CAUSA de uma sugestão desta rodada não entra na conta — evita
 * cadeia de trocas difícil de explicar pro usuário.
 */
export function suggestNumberUpgrades(
  players: { id: string; position: Pos; squad_number?: number | null; overall?: number | null }[],
): NumberUpgradeSuggestion[] {
  const used = new Set<number>(players.map((p) => p.squad_number).filter((n): n is number => n != null));

  type Candidate = { playerId: string; currentNumber: number; targetNumber: number; improvement: number; overall: number };
  const candidates: Candidate[] = [];
  for (const p of players) {
    if (p.squad_number == null) continue;
    const curRank = prefRank(p.position, p.squad_number);
    let bestTarget: number | null = null;
    let bestRank = curRank;
    for (let r = 0; r < PREF[basePos(p.position)].length; r++) {
      const n = PREF[basePos(p.position)][r];
      if (used.has(n)) continue;
      if (r < bestRank) { bestRank = r; bestTarget = n; }
    }
    if (bestTarget != null) {
      candidates.push({
        playerId: p.id, currentNumber: p.squad_number, targetNumber: bestTarget,
        improvement: curRank - bestRank, overall: p.overall ?? 0,
      });
    }
  }

  // Maior ganho primeiro; empate por overall (quem "merece" mais o número bom).
  candidates.sort((a, b) => b.improvement - a.improvement || b.overall - a.overall);
  const claimed = new Set<number>();
  const out: NumberUpgradeSuggestion[] = [];
  for (const c of candidates) {
    if (claimed.has(c.targetNumber)) continue;
    claimed.add(c.targetNumber);
    out.push({ playerId: c.playerId, currentNumber: c.currentNumber, suggestedNumber: c.targetNumber });
  }
  return out;
}

/**
 * Numera um elenco inteiro do zero. Ordena por setor (GK→DEF→MID→FWD) e overall,
 * e vai puxando da pilha de preferência de cada setor.
 */
export function assignSquadNumbers(
  players: { id: string; position: Pos; overall?: number | null }[],
): Record<string, number> {
  const ordered = [...players].sort((a, b) => {
    const po = (POS_ORDER[basePos(a.position)] ?? 2) - (POS_ORDER[basePos(b.position)] ?? 2);
    return po !== 0 ? po : (b.overall ?? 0) - (a.overall ?? 0);
  });
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const p of ordered) {
    let picked = 0;
    for (const n of PREF[basePos(p.position)]) {
      if (!used.has(n)) { picked = n; break; }
    }
    if (!picked) picked = lowestFree(used);
    used.add(picked);
    out[p.id] = picked;
  }
  return out;
}
