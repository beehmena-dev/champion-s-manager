import type { PlayerLike } from "./types";
import { injuryTypeLabel } from "./medical";

export interface AvailabilityResult {
  available: boolean;
  reason?: "injured" | "suspended" | "doubtful";
  label?: string;      // texto pronto pra UI
  fitPct?: number;      // só quando reason === "doubtful": chance de estar apto (0-100)
  atRisk?: boolean;     // recém-recuperado, dentro da janela de risco de recaída (informativo, não bloqueia)
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const DOUBTFUL_WINDOW_DAYS = 3;

/**
 * Verifica se um jogador pode ser escalado hoje (`todayISO`, formato YYYY-MM-DD).
 *
 * Nos últimos DOUBTFUL_WINDOW_DAYS antes de `injured_until`, o jogador vira
 * "duvidoso": pode ser escalado, mas com uma % de chance de estar apto (igual
 * o teste de aptidão física do FM) — quem decide se arrisca é o técnico.
 */
export function checkAvailability(player: PlayerLike, todayISO: string): AvailabilityResult {
  if ((player.suspended_matches ?? 0) > 0) {
    const n = player.suspended_matches as number;
    return { available: false, reason: "suspended", label: `Suspenso (${n} jogo${n === 1 ? "" : "s"})` };
  }

  if (player.injured_until && player.injured_until >= todayISO) {
    const daysLeft = daysBetween(todayISO, player.injured_until);
    const typeLabel = injuryTypeLabel(player.injury_type);
    if (daysLeft <= DOUBTFUL_WINDOW_DAYS) {
      const fitPct = Math.round(((DOUBTFUL_WINDOW_DAYS - daysLeft) / DOUBTFUL_WINDOW_DAYS) * 60 + 40);
      return {
        available: true,
        reason: "doubtful",
        fitPct,
        label: `Duvidoso — ${typeLabel}, ${fitPct}% apto`,
      };
    }
    const [, m, d] = player.injured_until.split("-");
    return { available: false, reason: "injured", label: `${typeLabel} até ${d}/${m}` };
  }

  if (player.injury_risk_until && player.injury_risk_until >= todayISO) {
    return { available: true, atRisk: true, label: "Recém-recuperado — risco de recaída" };
  }

  return { available: true };
}