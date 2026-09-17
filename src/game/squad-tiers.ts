// -----------------------------------------------------------------------------
// Equipes B / elenco reserva (item 15 do backlog FootSim) — lógica pura.
//
// Partição de jogador ("elenco principal" vs "equipe B/reservas"), controlada
// pelo técnico na tela de Elenco — nunca automática, e nunca trava quem pode
// ser escalado na tela de Tática (o técnico ainda pode chamar um jogador da
// Equipe B pro time principal quando quiser). O efeito mecânico real: jogador
// na Equipe B tem minutos regulares garantidos (ainda que de nível mais
// baixo) em vez de apodrecer no banco do time principal — bônus modesto de
// velocidade de treino, mesmo espírito de tempero (nunca decide sozinho o
// desenvolvimento) da mentoria (item 16) e da química de elenco (item 08).
// -----------------------------------------------------------------------------

export type SquadTier = "first_team" | "b_team";

export const SQUAD_TIER_LABELS: Record<SquadTier, string> = {
  first_team: "Elenco principal",
  b_team: "Equipe B",
};

export const B_TEAM_TRAINING_BONUS = 1.15;

export function trainingMultiplierForTier(tier: string | null | undefined): number {
  return tier === "b_team" ? B_TEAM_TRAINING_BONUS : 1;
}
