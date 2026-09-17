// -----------------------------------------------------------------------------
// Valor de mercado — antes ficava travado no valor da importação do seed (ou
// da geração de um juvenil) pro resto da carreira do jogador, mesmo com o
// overall mudando bastante (treino, evolução de jovem, declínio por idade).
// Em vez de recalcular do zero com uma fórmula (o que destoaria dos valores
// reais importados via seed.json), ajusta PROPORCIONALMENTE ao valor atual
// toda vez que o overall muda — cada ponto de overall move o valor em ~7%,
// composto. Ver src/lib/advance-day.ts (treino) e src/lib/season-rollover.ts
// (virada de temporada).
// -----------------------------------------------------------------------------
export function adjustMarketValue(currentValue: number, overallDelta: number): number {
  if (!currentValue || overallDelta === 0) return currentValue;
  return Math.max(1000, Math.round(currentValue * Math.pow(1.07, overallDelta)));
}

// -----------------------------------------------------------------------------
// Valorização por sequência de desempenho (backlog FootSim #07) — valor de
// mercado também reage a boa/má fase recente, não só a mudança de overall.
// Reaproveita a MESMA curva multiplicativa de adjustMarketValue (cada "ponto
// equivalente" move ~7%), só que numa escala bem menor: o delta de forma de
// UMA partida (tipicamente ±3 a ±15, ver advance-day.ts) vira uma fração
// pequena de ponto equivalente — reage partida a partida, mas só acumula
// visivelmente numa sequência real (boa ou ruim), não num lance isolado.
// Só se aplica a jogadores cuja forma é realmente simulada partida a partida
// (hoje: elenco do usuário — clubes de IA não têm forma individual viva, ver
// advance-day.ts) — não é uma lacuna deste item, é o alcance real do dado.
const FORM_DELTA_TO_OVERALL_EQUIV = 1 / 40;

export function applyFormMarketMomentum(currentValue: number, formDeltaApplied: number): number {
  if (!currentValue || formDeltaApplied === 0) return currentValue;
  return adjustMarketValue(currentValue, formDeltaApplied * FORM_DELTA_TO_OVERALL_EQUIV);
}

// Sinal visível de tendência (tela de jogador) — 70 é o neutro usado pelo
// resto do motor (advance-day.ts::"p.form ?? 70"); só sinaliza quando o
// desvio já é grande o bastante pra ter puxado o valor de forma perceptível
// (mesmo padrão de "só mostra quando o efeito é relevante" do item 08).
export type MarketTrend = "rising" | "falling" | "stable";

export function marketTrendFromForm(form: number | null | undefined): MarketTrend {
  const f = form ?? 70;
  if (f >= 80) return "rising";
  if (f <= 55) return "falling";
  return "stable";
}
