// -----------------------------------------------------------------------------
// Risco de contrato a vencer — lógica pura (sem I/O).
//
// Item 03 do backlog FootSim: "lista consolidada de jogadores perto do fim de
// contrato, sinalizada por nível de risco — pra parar de perder jogador de
// graça por esquecimento em vez de colunas soltas". A coluna já existia
// (ContractBadge em saves.$saveId.squad.tsx, limiares 60/180 dias) — esse
// módulo formaliza os MESMOS limiares num nível de risco nomeado, reusado
// tanto pela lista consolidada quanto pelo alerta do painel inicial.
// -----------------------------------------------------------------------------

export type ContractRisk = "critico" | "atencao";

export const CONTRACT_CRITICAL_DAYS = 60;
export const CONTRACT_WATCH_DAYS = 180;
// Janela de "radar" pra lista consolidada — mostra também quem vence dentro
// de uma temporada, pra dar tempo real de negociar, não só quando já é tarde.
export const CONTRACT_RADAR_DAYS = 365;

export interface ContractRiskEntry {
  id: string;
  daysRemaining: number;
  risk: ContractRisk | null;
}

export function daysUntil(contractUntilISO: string, todayISO: string): number {
  return Math.round(
    (new Date(contractUntilISO + "T00:00:00Z").getTime() - new Date(todayISO + "T00:00:00Z").getTime()) / 86_400_000,
  );
}

export function contractRisk(daysRemaining: number): ContractRisk | null {
  if (daysRemaining < 0) return null; // vencido: já virou outra tela (jogador sai), não é "risco" a monitorar
  if (daysRemaining <= CONTRACT_CRITICAL_DAYS) return "critico";
  if (daysRemaining <= CONTRACT_WATCH_DAYS) return "atencao";
  return null;
}

export const CONTRACT_RISK_LABEL: Record<ContractRisk, string> = {
  critico: "Crítico",
  atencao: "Atenção",
};

/**
 * Elenco inteiro → só quem tem contrato dentro do radar (≤365 dias),
 * ordenado por urgência (vence primeiro, primeiro na lista). Vencidos
 * (days < 0) ficam de fora — sem contrato pra "vencer" mais, já é outro
 * problema (jogador livre, ver checkReleaseClauses/season-rollover).
 */
export function contractsAtRisk<T extends { id: string; contract_until?: string | null }>(
  players: T[],
  todayISO: string,
): (T & ContractRiskEntry)[] {
  const withDays = players
    .filter((p): p is T & { contract_until: string } => !!p.contract_until)
    .map((p) => ({ ...p, daysRemaining: daysUntil(p.contract_until, todayISO) }))
    .filter((p) => p.daysRemaining >= 0 && p.daysRemaining <= CONTRACT_RADAR_DAYS);
  return withDays
    .map((p) => ({ ...p, risk: contractRisk(p.daysRemaining) }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}
