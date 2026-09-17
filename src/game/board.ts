// -----------------------------------------------------------------------------
// Diretoria e objetivos — lógica pura (sem I/O).
//
// No início de cada temporada, a diretoria define uma meta pro clube do
// usuário com base no RANK de reputação dele DENTRO da própria liga (não um
// corte fixo de reputação absoluta — reputação 70 significa coisas bem
// diferentes numa liga forte ou fraca). No fim da temporada, bater ou não a
// meta empurra a confiança da diretoria pra cima ou pra baixo — confiança
// muito baixa é sinal de que o técnico está com o emprego em risco.
//
// Item 12 do backlog FootSim: as faixas usam o vocabulário real do futebol
// brasileiro (G-4/G-6/Z-4), igual o board do FM de verdade usa faixas de
// posição (não corte de reputação) pra definir a meta.
// -----------------------------------------------------------------------------

export type ObjectiveKind =
  | "win_league" | "top4" | "top6" | "top_half" | "mid_table" | "avoid_relegation" | "fight_relegation";

export interface SeasonObjective {
  kind: ObjectiveKind;
  target: number; // posição-alvo — final_position <= target bate a meta, pra TODAS as faixas
}

export function objectiveLabel(obj: SeasonObjective): string {
  switch (obj.kind) {
    case "win_league": return "Vencer o campeonato";
    case "top4": return "Brigar pelo G-4";
    case "top6": return "Brigar pelo G-6";
    case "top_half": return "Terminar na primeira metade da tabela";
    case "mid_table": return "Campanha de meio de tabela";
    case "avoid_relegation": return "Fugir da zona de rebaixamento";
    case "fight_relegation": return "Lutar contra o rebaixamento";
    default: return `Terminar entre os ${obj.target} primeiros`; // compat com "top_n", o kind antigo (pré item 12) já gravado em saves existentes
  }
}

/**
 * @param reputationRank posição do clube (1 = maior reputação) dentro da
 *   própria competição — não a reputação absoluta.
 * @param relegationSlots tamanho real da zona de rebaixamento dessa
 *   competição (0 quando é a divisão mais baixa da pirâmide — nesse caso
 *   não existe pra onde cair, então as faixas de rebaixamento não fazem
 *   sentido e a meta cai pra "campanha de meio de tabela").
 * @param reputationGapToLeader diferença de reputação pro clube de MAIOR
 *   reputação da liga (0 = é o próprio líder ou está empatado com ele).
 *   Sem isso, só o clube exatamente em 1º lugar (ou, em ligas grandes, o
 *   punhado dentro do top 8%) recebia "vencer o campeonato" — um clube
 *   empatado ou a 1-2 pontos do líder (ex. 2º/3º lugar claramente
 *   favorito, caso real achado com o Al-Hilal numa liga saudita onde 3
 *   clubes têm reputação quase idêntica) caía pra "G-4" por causa só da
 *   ordem de desempate, o que não faz sentido — na prática ele TAMBÉM é
 *   favorito ao título.
 */
const ELITE_REPUTATION_MARGIN = 3;

export function generateObjective(
  reputationRank: number, leagueSize: number, relegationSlots: number, reputationGapToLeader = Infinity,
): SeasonObjective {
  const size = Math.max(1, leagueSize);
  const pct = Math.max(1, reputationRank) / size;
  const clampTarget = (n: number) => Math.max(1, Math.min(size, Math.round(n)));

  const isElite = reputationRank === 1 || pct <= 0.08 || reputationGapToLeader <= ELITE_REPUTATION_MARGIN;
  if (isElite) return { kind: "win_league", target: 1 };
  if (pct <= 0.25) return { kind: "top4", target: clampTarget(Math.max(4, size * 0.20)) };
  if (pct <= 0.40) return { kind: "top6", target: clampTarget(Math.max(6, size * 0.30)) };
  if (pct <= 0.55) return { kind: "top_half", target: clampTarget(size * 0.50) };
  if (relegationSlots <= 0 || pct <= 0.75) return { kind: "mid_table", target: clampTarget(size * 0.65) };

  const survivalTarget = clampTarget(size - relegationSlots);
  if (pct <= 0.90) return { kind: "avoid_relegation", target: survivalTarget };
  return { kind: "fight_relegation", target: survivalTarget };
}

export function evaluateObjective(obj: SeasonObjective, finalPosition: number): "met" | "missed" {
  return finalPosition <= obj.target ? "met" : "missed";
}

/**
 * Quanto a confiança da diretoria muda no fim da temporada. Bater a meta com
 * folga rende bônus extra; ficar bem longe da meta dói mais que ficar por
 * pouco. "Lutar contra o rebaixamento" é a faixa mais fraca — sobreviver
 * quando ninguém esperava vale um bônus extra, e cair (o resultado mais
 * "esperado" pra esse clube) dói menos do que decepcionar numa faixa mais alta.
 */
export function confidenceDelta(obj: SeasonObjective, finalPosition: number): number {
  const status = evaluateObjective(obj, finalPosition);
  const underdog = obj.kind === "fight_relegation";
  if (status === "met") {
    const margin = Math.max(0, obj.target - finalPosition);
    const base = Math.min(30, 15 + margin * 2);
    return underdog ? Math.round(base * 1.4) : base;
  }
  const shortfall = finalPosition - obj.target;
  const base = -Math.min(35, 12 + shortfall * 2);
  return underdog ? Math.round(base * 0.6) : base;
}

export const BOARD_CONFIDENCE_CRITICAL = 25;

// -----------------------------------------------------------------------------
// Reputação do técnico — pessoal, separada da confiança da diretoria do
// clube atual (que reseta a cada troca de clube) e da reputação do clube.
// Se move mais devagar, ao longo de toda a carreira, e alimenta as
// sondagens de emprego (ver src/game/job-offers.ts).
// -----------------------------------------------------------------------------
export function managerReputationDelta(finalPosition: number, objectiveTarget: number, isChampion: boolean): number {
  if (isChampion) return 10;
  const met = finalPosition <= objectiveTarget;
  if (met) {
    const margin = Math.max(0, objectiveTarget - finalPosition);
    return Math.min(8, 3 + margin);
  }
  const shortfall = finalPosition - objectiveTarget;
  return -Math.min(8, 2 + Math.round(shortfall / 2));
}

// -----------------------------------------------------------------------------
// Reputação do CLUBE — diferente da reputação pessoal do técnico (que segue a
// carreira dele) e da confiança da diretoria (que reseta a cada demissão).
// Antes ficava travada no valor do seed pra sempre, pra qualquer clube (nem
// o do usuário mudava) — mesmo sendo usada o save inteiro por bilheteria,
// patrocínio, tática de IA, negociação de mercado e sondagem de emprego.
// Deriva devagar, pela posição final na tabela: campeão sobe, lanterna desce,
// meio de tabela quase não mexe. Ver src/lib/season-rollover.ts.
// -----------------------------------------------------------------------------
export function clubReputationDelta(finalPosition: number, leagueSize: number): number {
  if (leagueSize <= 1) return 0;
  const normalized = 1 - (2 * (finalPosition - 1)) / (leagueSize - 1); // topo=+1 .. lanterna=-1
  return Math.round(normalized * 3);
}

// -----------------------------------------------------------------------------
// Verba de transferência — aporte de fim de temporada, escalado pela
// reputação do clube. Sem isso, a verba de transferência de todo clube de IA
// só encolhe ou troca de mãos (negociação é soma zero entre eles — ver
// src/lib/ai-transfers.ts); o clube do usuário tem o pedido de verba avulso
// (evaluateBudgetRequest acima), a IA não tinha NADA recorrente. Ver
// src/lib/season-rollover.ts.
// -----------------------------------------------------------------------------
export function transferBudgetInjection(clubReputation: number): number {
  return Math.round(clubReputation * 8_000);
}

// -----------------------------------------------------------------------------
// Pedido de verba extra à diretoria — quanto maior a confiança e a
// reputação do clube, mais generoso (e mais provável) o aporte.
// -----------------------------------------------------------------------------
export interface BudgetRequestResult {
  approved: boolean;
  grantedAmount: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function budgetCeiling(boardConfidence: number, clubReputation: number): number {
  return clubReputation * 20_000 * clamp(boardConfidence / 60, 0.3, 1.8);
}

export function evaluateBudgetRequest(
  amountRequested: number,
  boardConfidence: number,
  clubReputation: number,
): BudgetRequestResult {
  const ceiling = budgetCeiling(boardConfidence, clubReputation);
  if (amountRequested > ceiling * 1.4) return { approved: false, grantedAmount: 0 };
  const grantRatio = clamp(boardConfidence / 100, 0.35, 1);
  const grantedAmount = Math.round(Math.min(amountRequested, ceiling) * grantRatio);
  return { approved: grantedAmount > 0, grantedAmount };
}

// Valor "de bom senso" pra pré-preencher o campo de pedido de verba — o teto
// que evaluateBudgetRequest() realmente respeita, não um número fixo que
// pode já nascer acima do teto (rejeitado na hora) ou bem abaixo dele
// (deixando verba na mesa) dependendo do clube.
export function suggestedBudgetRequest(boardConfidence: number, clubReputation: number): number {
  return Math.round(budgetCeiling(boardConfidence, clubReputation));
}

// -----------------------------------------------------------------------------
// Instalações (CT e base) — nível 1-5, 3 é o padrão neutro. O CT afeta o ritmo
// de treino/recuperação (ver src/lib/advance-day.ts); a base afeta a qualidade
// dos juniores (ver src/game/youth.ts). Melhoradas pelo catálogo de pedidos.
// -----------------------------------------------------------------------------
export function facilityFactor(level: number): number {
  return clamp(1 + (level - 3) * 0.12, 0.7, 1.3); // nível 5 = +24% no efeito
}

// -----------------------------------------------------------------------------
// Catálogo de pedidos à diretoria (estilo FM). Cada item tem pré-requisito de
// confiança e (quando custa do caixa) de liquidez. Aplicado em src/lib/board.ts,
// tela em src/routes/_authenticated/saves.$saveId.board.tsx.
// -----------------------------------------------------------------------------
export type BoardRequestKind =
  | "verba_transferencia" | "teto_salarial" | "melhorar_ct" | "melhorar_base" | "ampliar_estadio";

export interface BoardRequestItem {
  kind: BoardRequestKind;
  title: string;
  description: string;
  benefit: string;
  minConfidence: number;
  cashCost: number; // 0 = aporte da diretoria (não sai do caixa)
}

const CT_COST = 18_000_000;
const BASE_COST = 15_000_000;
const STADIUM_COST = 35_000_000;
const STADIUM_SEATS = 6_000;

export const BOARD_REQUEST_CATALOG: BoardRequestItem[] = [
  { kind: "verba_transferencia", title: "Injeção de verba para contratações", description: "Aporte extraordinário direto no orçamento de transferências.", benefit: "+ verba de transferências, escalada pela reputação do clube.", minConfidence: 55, cashCost: 0 },
  { kind: "teto_salarial", title: "Aumento do teto salarial", description: "Amplia a margem da folha para renovações e reforços de peso.", benefit: "+ caixa operacional para acomodar salários.", minConfidence: 50, cashCost: 0 },
  { kind: "melhorar_ct", title: "Modernização do Centro de Treinamento", description: "Novos campos, biometria e equipamentos de recuperação muscular.", benefit: "CT +1 estrela — treino e recuperação física mais rápidos.", minConfidence: 62, cashCost: CT_COST },
  { kind: "melhorar_base", title: "Investimento na categoria de base", description: "Mais olheiros mirins e melhor estrutura para as divisões de base.", benefit: "Base +1 estrela — juniores nascem mais fortes e com mais potencial.", minConfidence: 58, cashCost: BASE_COST },
  { kind: "ampliar_estadio", title: "Ampliação do estádio", description: "Novas arquibancadas e camarotes premium.", benefit: `+ ${STADIUM_SEATS.toLocaleString("pt-BR")} lugares — mais receita de bilheteria por jogo em casa.`, minConfidence: 70, cashCost: STADIUM_COST },
];

export const MAX_BOARD_REQUESTS_PER_SEASON = 3;

export interface BoardRequestEffects {
  transfer_budget_delta?: number;
  budget_delta?: number;
  training_facilities_delta?: number;
  youth_facilities_delta?: number;
  stadium_capacity_delta?: number;
  board_confidence_delta?: number;
}
export interface BoardRequestOutcome {
  approved: boolean;
  response: string;
  effects: BoardRequestEffects;
}

const brl = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1)}M` : `R$ ${(n / 1_000).toFixed(0)}k`;

export function evaluateBoardRequest(
  kind: BoardRequestKind,
  ctx: {
    boardConfidence: number; cash: number; clubReputation: number;
    requestsThisSeason: number; trainingFacilities: number; youthFacilities: number;
  },
): BoardRequestOutcome {
  const item = BOARD_REQUEST_CATALOG.find((i) => i.kind === kind);
  if (!item) return { approved: false, response: "Pedido inválido.", effects: {} };

  if (ctx.requestsThisSeason >= MAX_BOARD_REQUESTS_PER_SEASON) {
    return { approved: false, response: "A diretoria já atendeu vários pedidos nesta temporada — trabalhe com o que tem até a próxima.", effects: {} };
  }
  if (ctx.boardConfidence < item.minConfidence) {
    return { approved: false, response: `O Conselho quer resultados mais consistentes antes de assumir esse compromisso (confiança mínima: ${item.minConfidence}%).`, effects: {} };
  }
  if (item.cashCost > 0 && ctx.cash < item.cashCost * 0.6) {
    return { approved: false, response: "Recusado por liquidez: o caixa atual não comporta este desembolso agora.", effects: {} };
  }

  switch (kind) {
    case "verba_transferencia": {
      // Aporte próprio do catálogo (curva mais generosa que a de fim de
      // temporada em transferBudgetInjection, que roda pra liga inteira).
      const amount = Math.round(ctx.clubReputation ** 2 * 320 * clamp(ctx.boardConfidence / 70, 0.5, 1.6));
      return { approved: true, response: `Aprovado. A diretoria liberou ${brl(amount)} para o orçamento de transferências.`, effects: { transfer_budget_delta: amount, board_confidence_delta: 1 } };
    }
    case "teto_salarial": {
      const amount = Math.round(ctx.clubReputation ** 2 * 190 * clamp(ctx.boardConfidence / 70, 0.5, 1.5));
      return { approved: true, response: `Aprovado. O caixa operacional foi reforçado em ${brl(amount)} para acomodar a folha.`, effects: { budget_delta: amount, board_confidence_delta: 1 } };
    }
    case "melhorar_ct": {
      if (ctx.trainingFacilities >= 5) return { approved: false, response: "O CT já é de primeira linha — não há o que melhorar por ora.", effects: {} };
      return { approved: true, response: "Excelente visão de longo prazo. As obras de modernização do CT foram autorizadas.", effects: { training_facilities_delta: 1, budget_delta: -CT_COST, board_confidence_delta: 3 } };
    }
    case "melhorar_base": {
      if (ctx.youthFacilities >= 5) return { approved: false, response: "A estrutura de base já é de elite.", effects: {} };
      return { approved: true, response: "Aprovado com louvor. Fortalecer a base é essencial para a sustentabilidade do clube.", effects: { youth_facilities_delta: 1, budget_delta: -BASE_COST, board_confidence_delta: 3 } };
    }
    case "ampliar_estadio": {
      return { approved: true, response: `Aprovada a expansão do estádio em ${STADIUM_SEATS.toLocaleString("pt-BR")} novos assentos! A bilheteria vai crescer.`, effects: { stadium_capacity_delta: STADIUM_SEATS, budget_delta: -STADIUM_COST, board_confidence_delta: 4 } };
    }
  }
}

// -----------------------------------------------------------------------------
// Patrocínio — renda mensal automática (dia 1 de cada mês, junto da folha
// salarial), escalada pela reputação do clube. Sem negociação por ora, é
// só um fluxo de caixa recorrente — ver src/lib/advance-day.ts.
// -----------------------------------------------------------------------------
export function sponsorIncome(clubReputation: number): number {
  return Math.round(clubReputation * 12_000);
}

// -----------------------------------------------------------------------------
// Bônus de patrocínio por desempenho (item 13 do backlog FootSim) — o repasse
// mensal acima é fixo, sem negociação; isso aqui é a "meta específica" que o
// card pede (ex. "bônus por título"). Reaproveita a MESMA avaliação de
// objetivo de temporada do item 12 (season_objectives) em vez de inventar um
// contrato de patrocínio à parte — só paga quando a meta é batida, e quanto
// mais alta a faixa (vencer o campeonato vale muito mais em marketing que só
// evitar o rebaixamento), maior o bônus. "Lutar contra o rebaixamento"
// (sobreviver contra a expectativa) rende o mesmo multiplicador de
// "campanha de meio de tabela" — sobreviver contra tudo também vira notícia.
// -----------------------------------------------------------------------------
const SPONSOR_BONUS_MULTIPLIER: Record<ObjectiveKind, number> = {
  win_league: 3, top4: 1.6, top6: 1.2, top_half: 0.8, mid_table: 0.5, avoid_relegation: 0.3, fight_relegation: 0.5,
};

export function sponsorObjectiveBonus(clubReputation: number, obj: SeasonObjective, finalPosition: number): number {
  if (evaluateObjective(obj, finalPosition) !== "met") return 0;
  return Math.round(clubReputation * 3_000 * (SPONSOR_BONUS_MULTIPLIER[obj.kind] ?? 0.5));
}

// -----------------------------------------------------------------------------
// Personalidade da torcida (item 13 do backlog FootSim) — nenhuma base real
// traz "cultura do torcedor" por clube, então é procedural (mesmo padrão de
// brasão/kit gerado quando falta asset real): uma função pura e determinística
// do ID do clube, sem coluna nova nem I/O — o mesmo clube sempre tem a mesma
// personalidade a vida toda do save, sem precisar armazenar nada.
// - Apaixonada: estádio cheio quase sempre (piso de ocupação alto, variação
//   pequena) e clássico importa ainda mais.
// - Exigente: só lota quando o time está bem — teto mais alto, mas piso bem
//   mais baixo e variação grande (estádio some quando a torcida não empolga).
// - Tradicional: a curva original, sem efeito de personalidade.
// -----------------------------------------------------------------------------
export type FanTemperament = "apaixonada" | "exigente" | "tradicional";

export const FAN_TEMPERAMENT_LABEL: Record<FanTemperament, string> = {
  apaixonada: "Apaixonada", exigente: "Exigente", tradicional: "Tradicional",
};

export function fanTemperamentFromClubId(clubId: string): FanTemperament {
  let h = 0;
  for (let i = 0; i < clubId.length; i++) h = (h * 31 + clubId.charCodeAt(i)) >>> 0;
  return (["apaixonada", "exigente", "tradicional"] as const)[h % 3];
}

interface OccupancyProfile { floor: number; ceiling: number; varianceSpan: number; derbyBoost: number; }
const TEMPERAMENT_OCCUPANCY: Record<FanTemperament, OccupancyProfile> = {
  apaixonada: { floor: 0.55, ceiling: 0.95, varianceSpan: 0.08, derbyBoost: 1.25 },
  exigente: { floor: 0.25, ceiling: 1.00, varianceSpan: 0.35, derbyBoost: 1.05 },
  tradicional: { floor: 0.40, ceiling: 0.95, varianceSpan: 0.20, derbyBoost: 1.15 },
};

// -----------------------------------------------------------------------------
// Sócio-torcedor (item 18 do backlog FootSim) — mensalidade recorrente que
// NÃO depende de jogo em casa (ao contrário da bilheteria em gateIncome
// abaixo, que só paga em dia de jogo), lançada junto do patrocínio (dia 1 do
// mês, ver src/lib/advance-day.ts). Escopo honesto do card: "sócio-torcedor +
// merchandising + gestão comercial da torcida" virou só a mensalidade —
// merchandising/loja exigiria um catálogo de produto próprio, fora do que os
// dials atuais do clube sustentam.
//
// Reaproveita capacidade do estádio (proxy de tamanho de torcida, mesma
// coluna já usada em gateIncome) e a personalidade da torcida do item 13:
// torcida apaixonada assina fiel mesmo sem o time jogar bem, exigente adere
// pouco. Calibrado pra ficar bem abaixo do patrocínio (~15-25% dele pro
// clube mediano da base real) — reforço real, não substituto da renda
// principal.
// -----------------------------------------------------------------------------
const MEMBERSHIP_MONTHLY_FEE = 25; // R$/sócio/mês

const TEMPERAMENT_MEMBERSHIP_RATE: Record<FanTemperament, number> = {
  apaixonada: 0.28, tradicional: 0.18, exigente: 0.09,
};

export function membershipIncome(
  stadiumCapacity: number, clubReputation: number, temperament: FanTemperament = "tradicional",
): number {
  const rate = TEMPERAMENT_MEMBERSHIP_RATE[temperament];
  const reputationFactor = clamp(0.5 + clubReputation / 100, 0.5, 1.5);
  const members = Math.round(stadiumCapacity * rate * reputationFactor);
  return members * MEMBERSHIP_MONTHLY_FEE;
}

// -----------------------------------------------------------------------------
// Bilheteria — antes era um valor fixo aleatório igual pra qualquer clube;
// agora depende da capacidade real do estádio (já existe em clubs.stadium_capacity,
// só nunca tinha sido usada) e da reputação (público maior em clube grande),
// com bônus extra em clássico — e, desde o item 13, da personalidade da
// torcida (piso/teto/variação de ocupação mudam por clube). Ver
// src/lib/advance-day.ts.
// -----------------------------------------------------------------------------
const TICKET_PRICE = 45;

export function gateIncome(
  stadiumCapacity: number,
  clubReputation: number,
  isDerby: boolean,
  rng: () => number = Math.random,
  temperament: FanTemperament = "tradicional",
): { attendance: number; amount: number } {
  const profile = TEMPERAMENT_OCCUPANCY[temperament];
  const baseOccupancy = clamp(0.35 + clubReputation / 130, profile.floor, profile.ceiling);
  const derbyBoost = isDerby ? profile.derbyBoost : 1;
  const variance = (1 - profile.varianceSpan / 2) + rng() * profile.varianceSpan;
  const occupancy = clamp(baseOccupancy * derbyBoost * variance, 0, 1);
  const attendance = Math.round(stadiumCapacity * occupancy);
  const amount = Math.round(attendance * TICKET_PRICE);
  return { attendance, amount };
}
