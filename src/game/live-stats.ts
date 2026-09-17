import type { MatchEvent, MatchStats } from "./types";

// -----------------------------------------------------------------------------
// Estatísticas e "xG" pra visualização ao vivo (painel de stats, mapa de
// remates, gráfico de intervalo). Mesma filosofia de src/game/live-positions.ts:
// nosso motor (src/game/simulation.ts) calcula o total FINAL de cada
// estatística de uma vez, não evolui minuto a minuto, e não modela xG (não
// julga qualidade de chute) — então isso é uma camada de apresentação sobre
// o resultado discreto, não dado novo da simulação. Cartões são exceção: têm
// minuto exato nos eventos reais, então contam de verdade em vez de estimar.
// -----------------------------------------------------------------------------

function hash01(seed: number): number {
  const x = Math.sin(seed * 999.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface LiveStats {
  possession: number; // % do mandante
  shotsHome: number; shotsAway: number;
  onTargetHome: number; onTargetAway: number;
  cornersHome: number; cornersAway: number;
  foulsHome: number; foulsAway: number;
  yellowHome: number; yellowAway: number;
  redHome: number; redAway: number;
}

// Escala cada contador pela fração do jogo já decorrida — evita "entregar"
// o total final logo na abertura da bola. matchLength é 90 mesmo quando só
// se está vendo o 1º tempo (a fração fica menor que 1, então os números do
// intervalo saem proporcionalmente mais baixos que o total do jogo inteiro,
// como esperado).
export function liveMatchStats(
  stats: MatchStats | undefined,
  events: MatchEvent[],
  minute: number,
  matchLength: number = 90,
): LiveStats {
  const frac = Math.max(0, Math.min(1, minute / matchLength));
  const scale = (n: number) => Math.round(n * frac);
  const countCards = (type: "yellow" | "red", side: "home" | "away") =>
    events.filter((e) => e.type === type && e.side === side && e.minute <= minute).length;

  return {
    possession: stats?.possession ?? 50,
    shotsHome: scale(stats?.shotsHome ?? 0), shotsAway: scale(stats?.shotsAway ?? 0),
    onTargetHome: scale(stats?.onTargetHome ?? 0), onTargetAway: scale(stats?.onTargetAway ?? 0),
    cornersHome: scale(stats?.cornersHome ?? 0), cornersAway: scale(stats?.cornersAway ?? 0),
    foulsHome: scale(stats?.foulsHome ?? 0), foulsAway: scale(stats?.foulsAway ?? 0),
    yellowHome: countCards("yellow", "home"), yellowAway: countCards("yellow", "away"),
    redHome: countCards("red", "home"), redAway: countCards("red", "away"),
  };
}

export interface ShotMapEntry {
  eventMinute: number;
  side: "home" | "away";
  x: number; y: number; // mesmo sistema de coordenadas do live-positions.ts
  xg: number;
  scored: boolean;
}

// xG aproximado por tipo de evento — não é medição real (o motor não avalia
// qualidade de chute), só uma faixa plausível: gol tende mais alto, defesa
// do goleiro média, chance perdida mais baixa.
function approxXg(type: MatchEvent["type"], seed: number): number {
  const r = hash01(seed);
  if (type === "goal") return 0.25 + r * 0.35;
  if (type === "save") return 0.15 + r * 0.25;
  return 0.04 + r * 0.16; // chance
}

// Localização do "chute" — mesma fórmula de destino usada em
// src/game/live-positions.ts (ballInSpell, ramo com evento) pra bater com
// onde a bola converge visualmente nesse mesmo evento.
export function shotMapEntries(events: MatchEvent[]): ShotMapEntry[] {
  return events
    .filter((e) => e.type === "goal" || e.type === "chance" || e.type === "save")
    .map((e) => {
      // Profundidade dentro da área (não fixa na linha do gol) — só pro
      // mapa de remates espalhar visualmente; a bola ao vivo (live-positions.ts)
      // continua convergindo na linha do gol, que é o alvo "real" do lance.
      const depth = hash01(e.minute * 47.3 + 11) * 14;
      return {
        eventMinute: e.minute,
        side: e.side,
        x: 30 + hash01(e.minute * 999.7) * 40,
        y: e.side === "home" ? 4 + depth : 96 - depth,
        xg: approxXg(e.type, e.minute * 1.7 + 3),
        scored: e.type === "goal",
      };
    });
}

export interface XgPoint { minute: number; home: number; away: number }

// Série acumulada de xG até `uptoMinute` — pra desenhar o gráfico de
// "momento do jogo" (linha azul/vermelha subindo a cada chance).
export function xgMomentum(events: MatchEvent[], uptoMinute: number): XgPoint[] {
  const shots = shotMapEntries(events)
    .filter((s) => s.eventMinute <= uptoMinute)
    .sort((a, b) => a.eventMinute - b.eventMinute);

  const points: XgPoint[] = [{ minute: 0, home: 0, away: 0 }];
  let home = 0, away = 0;
  for (const s of shots) {
    if (s.side === "home") home += s.xg; else away += s.xg;
    points.push({ minute: s.eventMinute, home, away });
  }
  points.push({ minute: uptoMinute, home, away });
  return points;
}

// Texto curto de "análise da comissão técnica" — templado a partir da
// comparação de xG e finalizações, no mesmo tom informal do resto do jogo.
// Não é geração de linguagem natural, é um select entre frases prontas.
export function coachingAnalysis(
  events: MatchEvent[], minute: number, myIsHome: boolean,
): string {
  const xg = xgMomentum(events, minute).at(-1)!;
  const myXg = myIsHome ? xg.home : xg.away;
  const oppXg = myIsHome ? xg.away : xg.home;
  const diff = myXg - oppXg;

  if (myXg < 0.05 && oppXg < 0.05) return "Ainda sem muita movimentação ofensiva de nenhum dos dois lados — sigamos atentos.";
  if (diff > 0.35) return "Segundo o xG, tivemos um desempenho bem superior ao do adversário — seguimos no caminho certo.";
  if (diff > 0.1) return "Estamos criando mais e melhor que o adversário. Vale manter a estratégia.";
  if (diff < -0.35) return "O adversário está levando a melhor nas chances criadas — precisamos ajustar algo pro 2º tempo.";
  if (diff < -0.1) return "Estamos sofrendo mais chances do que criamos. Um ajuste tático pode equilibrar o jogo.";
  return "Jogo equilibrado até aqui em qualidade de chances — os detalhes vão decidir.";
}
