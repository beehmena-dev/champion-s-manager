// -----------------------------------------------------------------------------
// Potencial imprevisível — flops e late bloomers (item 17 do backlog FootSim)
// — lógica pura.
//
// Hoje o "trend" de fim de temporada (agePlayersAndReleaseContracts, em
// season-rollover.ts — é ali que a MAIORIA dos jogadores do mundo evolui,
// já que o treino dia-a-dia de tactics.ts só roda pro elenco do usuário) é
// só por FAIXA DE IDADE: todo jovem sobe igual, todo veterano cai igual,
// sem nenhuma relação com o `potential` declarado do jogador. É exatamente
// o "cumpre o potencial de forma linear e previsível" que o item 17 aponta.
//
// Duas funções dão dentes reais pro potencial: `developmentTrend` faz o
// trend de overall depender da folga entre overall e potencial (jovem já
// colado no próprio teto estagna mesmo novo — "flop"; veterano com folga
// real seguraaaar em vez de cair só por estar "velho" — "late bloomer").
// `driftPotential` faz o PRÓPRIO potencial sofrer um pequeno passeio
// aleatório uma vez por temporada (mais volátil quanto mais jovem, com uma
// cauda rara maior pra cima OU pra baixo — breakout/bust de verdade, não só
// ruído) — o teto não é mais fixo desde a geração do jogador.
// -----------------------------------------------------------------------------

// Sem potencial definido (alguns jogadores importados não têm), mantém o
// comportamento antigo — só por idade — em vez de inventar dado.
export function developmentTrend(age: number, overall: number, potential: number | null): number {
  if (potential == null) return age <= 23 ? 1 : age >= 30 ? -1 : 0;
  const headroom = potential - overall;
  // Jovem já sem folga real estagna mesmo sendo novo — o "flop".
  if (age <= 23) return headroom <= 1 ? 0 : 1;
  // Veterano com folga de verdade segura em vez de cair só por idade —
  // calibrado contra o banco real: 30+ tem folga média de 0,72 (mediana 0),
  // então esse limiar só dispara pra um veterano genuinamente fora da curva.
  if (age >= 30) return headroom >= 4 ? 0 : -1;
  return 0;
}

export interface PotentialDrift {
  potential: number;
  kind: "bust" | "breakout" | "normal";
}

// Volatilidade calibrada contra o banco real (folga média por faixa: ≤23 é
// 7,0 · 24-29 é 3,1 · 30+ é 0,7) — jovem tem margem real pra oscilar bastante
// numa temporada só, veterano já está com a trajetória bem mais definida.
function potentialVolatility(age: number): number {
  return age <= 19 ? 5 : age <= 23 ? 3 : age <= 28 ? 2 : 1;
}

export function driftPotential(
  age: number, overall: number, potential: number, rng: () => number = Math.random,
): PotentialDrift {
  const volatility = potentialVolatility(age);
  const roll = rng();
  let delta: number;
  let kind: PotentialDrift["kind"];
  if (roll < 0.06) { delta = -volatility * 2; kind = "bust"; }
  else if (roll < 0.12) { delta = volatility * 2; kind = "breakout"; }
  else { delta = Math.round((rng() - 0.5) * volatility); kind = "normal"; }
  // Nunca deixa o teto cair abaixo do overall atual (não faz sentido um
  // potencial menor que quem o jogador já é), nem passar do máximo do motor.
  const next = Math.max(overall + 1, Math.min(99, potential + delta));
  return { potential: next, kind };
}
