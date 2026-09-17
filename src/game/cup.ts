// -----------------------------------------------------------------------------
// Copa mata-mata — chaveamento por eliminação simples.
// Ida e volta em todas as fases, EXCETO a final (jogo único).
// Sem regra de gol fora — empate no agregado vai pra PRORROGAÇÃO (Lei 7,
// 2×15min, ver simulateExtraTimeFull/Quick mais abaixo) e só então PÊNALTIS.
// -----------------------------------------------------------------------------
import type { ClubLike, MatchEvent, PlayerLike } from "./types";
import { simulateMatchSegment, simulateQuick } from "./simulation";

export interface BracketPairing {
  home: string;   // clubId
  away: string | null; // null = bye (passa direto, sem jogar)
}

/** Menor potência de 2 >= n. */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Gera o chaveamento inicial (primeira fase) a partir da lista de clubes.
 * Se o número de clubes não for potência de 2, os clubes que sobram (menor
 * quantidade de "byes" possível) avançam direto pra segunda fase sem jogar —
 * como funciona em copas de verdade quando o número de participantes é ímpar.
 */
export function generateInitialBracket(clubIds: string[], rng: () => number = Math.random): BracketPairing[] {
  const shuffled = [...clubIds].sort(() => rng() - 0.5);
  const bracketSize = nextPowerOfTwo(shuffled.length);
  const byeCount = bracketSize - shuffled.length;

  const pairings: BracketPairing[] = [];
  const withByes = shuffled.slice(0, byeCount).map((c) => ({ home: c, away: null }));
  const rest = shuffled.slice(byeCount);

  for (let i = 0; i < rest.length; i += 2) {
    pairings.push({ home: rest[i], away: rest[i + 1] ?? null });
  }
  return [...withByes, ...pairings];
}

/** Sorteia pares aleatórios entre os vencedores de uma fase pra gerar a próxima. */
export function pairNextRound(winnerClubIds: string[], rng: () => number = Math.random): BracketPairing[] {
  const shuffled = [...winnerClubIds].sort(() => rng() - 0.5);
  const pairings: BracketPairing[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    pairings.push({ home: shuffled[i], away: shuffled[i + 1] ?? null });
  }
  return pairings;
}

/**
 * Nome da fase com base em quantas rodadas faltam pra final.
 * roundsRemaining = 0 → Final, 1 → Semifinal, 2 → Quartas, 3 → Oitavas, 4 → 32avos...
 */
export function roundName(roundsRemaining: number): string {
  const names: Record<number, string> = {
    0: "Final",
    1: "Semifinal",
    2: "Quartas de final",
    3: "Oitavas de final",
    4: "32avos de final",
    5: "64avos de final",
  };
  return names[roundsRemaining] ?? `${roundsRemaining + 1}ª fase`;
}

/** Quantas rodadas restam (incluindo a atual) até a final, dado o nº de confrontos nesta fase. */
export function roundsRemainingFromTieCount(tieCount: number): number {
  return Math.max(0, Math.round(Math.log2(tieCount)));
}

// -----------------------------------------------------------------------------
// Prorrogação (Lei 7) — 2 tempos de 15min quando o agregado empata no mata-
// mata, ANTES de ir pros pênaltis. `simulateExtraTimeFull` usa o motor de
// verdade (só possível quando dá pra montar escalação real — na prática, só
// confrontos com o clube do usuário, ver src/lib/cup-progression.ts) e já
// liga VAR (Lei 6) — mata-mata é exatamente o cenário que o user pediu VAR.
// `simulateExtraTimeQuick` é a aproximação estatística pros confrontos só-IA
// (que nunca carregam elenco completo — ver arquitetura de ligas de segundo
// plano), sem log de evento, mas respeitando a mesma ORDEM das leis
// (prorrogação sempre antes de pênaltis, nunca pulada).
// -----------------------------------------------------------------------------
export interface ExtraTimeResult {
  homeGoals: number; // só os gols DA PRORROGAÇÃO, não o agregado
  awayGoals: number;
  events?: MatchEvent[]; // presente só na versão "Full" (com engine completo)
}

export function simulateExtraTimeFull(
  home: ClubLike,
  away: ClubLike,
  homePlayers: PlayerLike[],
  awayPlayers: PlayerLike[],
  opts: {
    seed: string;
    homeLineup?: { player_id: string; slot: string; role: string | null; instructions?: unknown }[];
    awayLineup?: { player_id: string; slot: string; role: string | null; instructions?: unknown }[];
    todayISO?: string;
  },
): ExtraTimeResult {
  const first = simulateMatchSegment(home, away, homePlayers, awayPlayers, {
    ...opts, startMinute: 91, endMinute: 105, hasVar: true,
  });
  const second = simulateMatchSegment(home, away, homePlayers, awayPlayers, {
    ...opts, startMinute: 106, endMinute: 120, hasVar: true,
    carryState: first.carryState, rng: first.rng,
  });
  return { homeGoals: second.result.homeScore, awayGoals: second.result.awayScore, events: second.result.events };
}

export function simulateExtraTimeQuick(homeRating: number, awayRating: number, seed: string): ExtraTimeResult {
  const r = simulateQuick(homeRating, awayRating, `${seed}-et`, { minutes: 30 });
  return { homeGoals: r.homeScore, awayGoals: r.awayScore };
}

export interface PenaltyResult {
  home: number;
  away: number;
  winner: "home" | "away";
}

/**
 * Simula uma disputa de pênaltis. Ponderado pela qualidade do goleiro
 * (gk_reflexes) e da finalização média dos cobradores — não é 50/50 puro.
 */
export function simulatePenalties(
  homeGkReflexes: number,
  awayGkReflexes: number,
  homeFinishingAvg: number,
  awayFinishingAvg: number,
  rng: () => number = Math.random,
): PenaltyResult {
  const homeConvertChance = clamp(0.5 + (homeFinishingAvg - awayGkReflexes) / 100, 0.45, 0.92);
  const awayConvertChance = clamp(0.5 + (awayFinishingAvg - homeGkReflexes) / 100, 0.45, 0.92);

  let home = 0, away = 0;
  // 5 cobranças alternadas cada, depois morte súbita se empatar
  for (let round = 0; round < 5; round++) {
    if (rng() < homeConvertChance) home++;
    if (rng() < awayConvertChance) away++;
  }
  while (home === away) {
    const h = rng() < homeConvertChance;
    const a = rng() < awayConvertChance;
    if (h) home++;
    if (a) away++;
    if (h !== a) break; // decidiu na rodada de morte súbita
  }
  return { home, away, winner: home > away ? "home" : "away" };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface PenaltyInputs {
  gkReflexes: number;
  finishingAvg: number;
}

type PenaltySquadPlayer = { position: string; attributes?: { reflexes?: number; penalty_taking?: number; composure?: number } | null };

// Extrai os dois números que simulatePenalties precisa a partir do elenco
// disponível — reflexos do melhor goleiro e a cobrança média dos principais
// batedores. Agora que temos Cobrança de Pênalti como atributo real (não
// existia no modelo antigo, que reaproveitava Finalização), os batedores são
// ranqueados por ela, misturada com Compostura — ver rateTacticalTeam em
// src/game/tactics.ts pro resto do jogo normal. Cai pra um valor neutro (10)
// se faltar goleiro/elenco.
export function penaltyInputsFromSquad(players: PenaltySquadPlayer[]): PenaltyInputs {
  const gks = players.filter((p) => p.position === "GK");
  const gkReflexes = gks.length > 0 ? Math.max(...gks.map((p) => p.attributes?.reflexes ?? 10)) : 10;
  const outfield = players.filter((p) => p.position !== "GK");
  const takerScore = (p: PenaltySquadPlayer) => (p.attributes?.penalty_taking ?? 10) * 0.7 + (p.attributes?.composure ?? 10) * 0.3;
  const topTakers = [...outfield].sort((a, b) => takerScore(b) - takerScore(a)).slice(0, 5);
  const finishingAvg = topTakers.length > 0
    ? topTakers.reduce((a, p) => a + takerScore(p), 0) / topTakers.length
    : 10;
  return { gkReflexes, finishingAvg };
}