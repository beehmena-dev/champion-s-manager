// -----------------------------------------------------------------------------
// Congestionamento de calendário — detecta sequências apertadas de jogos
// (liga + copa caindo perto) e sugere rodízio. O efeito mecânico fica na
// simulação (src/game/simulation.ts): elenco cansado se lesiona mais. Aqui é
// só a análise das datas, consumida pelo painel, pelo calendário e pela caixa
// de entrada.
// -----------------------------------------------------------------------------

export interface CongestionMatch {
  id: string;
  date: string;                       // ISO YYYY-MM-DD
  competitionType?: string | null;    // "league" | "cup" | ...
  label?: string;                     // ex. "MCI × EVE"
}

export interface CongestionRun {
  matches: CongestionMatch[];
  spanDays: number;    // dias entre o 1º e o último jogo da sequência
  minGapDays: number;  // menor intervalo entre dois jogos consecutivos
}

export interface CongestionReport {
  level: "none" | "moderate" | "severe";
  nextRun: CongestionRun | null;
  headline: string;
  advice: string;
}

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

// Sequência apertada = janela de <= WINDOW dias com >= RUN_MIN jogos, OU dois
// jogos com <= TIGHT_GAP dias de intervalo (meio de semana + fim de semana).
const WINDOW = 10;
const RUN_MIN = 3;
const TIGHT_GAP = 3;

/** Menor intervalo entre jogos consecutivos de uma lista já ordenada por data. */
export function minGapOf(matches: CongestionMatch[]): number {
  let min = Infinity;
  for (let i = 1; i < matches.length; i++) {
    min = Math.min(min, dayDiff(matches[i - 1].date, matches[i].date));
  }
  return matches.length < 2 ? Infinity : min;
}

export function analyzeCongestion(
  upcoming: CongestionMatch[],
  fromDate: string,
  horizonDays = 21,
): CongestionReport {
  const none: CongestionReport = { level: "none", nextRun: null, headline: "", advice: "" };

  const future = upcoming
    .filter((m) => {
      const d = dayDiff(fromDate, m.date);
      return d >= 0 && d <= horizonDays;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (future.length < 2) return none;

  // Primeiro cluster que caracteriza uma sequência apertada.
  let best: CongestionRun | null = null;
  for (let i = 0; i < future.length && !best; i++) {
    const cluster: CongestionMatch[] = [future[i]];
    for (let j = i + 1; j < future.length; j++) {
      if (dayDiff(future[i].date, future[j].date) <= WINDOW) cluster.push(future[j]);
      else break;
    }
    const minGap = minGapOf(cluster);
    const isRun = cluster.length >= RUN_MIN || (cluster.length >= 2 && minGap <= TIGHT_GAP);
    if (isRun) {
      best = {
        matches: cluster,
        spanDays: dayDiff(cluster[0].date, cluster[cluster.length - 1].date),
        minGapDays: minGap === Infinity ? 0 : minGap,
      };
    }
  }
  if (!best) return none;

  const severe = best.matches.length >= 3 && best.minGapDays <= 3;
  const n = best.matches.length;
  const hasCup = best.matches.some((m) => m.competitionType === "cup")
    && best.matches.some((m) => m.competitionType === "league");
  return {
    level: severe ? "severe" : "moderate",
    nextRun: best,
    headline: `${n} jogos em ${best.spanDays} dia${best.spanDays === 1 ? "" : "s"}`
      + (hasCup ? " (liga + copa)" : ""),
    advice: severe
      ? "Sequência pesada. Rode o elenco no meio da semana — 3 ou 4 mudanças pra não torrar os titulares e evitar lesão."
      : "Dois jogos coladinhos. Considere poupar quem está com a condição baixa.",
  };
}
