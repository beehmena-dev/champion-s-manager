// -----------------------------------------------------------------------------
// Item 10 do backlog FootSim: "empréstimos com forma e felicidade" — o card
// pede visibilidade real de como um empréstimo está indo (inspirado no
// Development Centre > Loans do FM real: sparkline de forma + "loan
// happiness"). Escopo honesto: o motor só simula estatística viva (forma,
// presença, gols) pro elenco do USUÁRIO — um jogador emprestado PRA FORA (pro
// time de um clube de IA) não gera nenhum dado real de como está indo lá (o
// motor não simula minutos/forma individual de clube de IA, ver
// advance-day.ts). Por isso: progresso de prazo (real, sempre disponível,
// esta função) pros empréstimos OUT; forma/presença/gols reais (já
// rastreados no elenco) pros empréstimos IN, direto na UI. Nunca inventamos
// uma "felicidade" numérica sem dado real por trás dela.
// -----------------------------------------------------------------------------
import { LOAN_DURATION_DAYS } from "./transfer-negotiation";

export interface LoanProgress {
  daysElapsed: number;
  daysRemaining: number;
  progressPct: number; // 0-100
}

export function loanOutProgress(loanReturnDateISO: string, todayISO: string): LoanProgress {
  const ret = new Date(loanReturnDateISO + "T00:00:00Z").getTime();
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const daysRemaining = Math.max(0, Math.round((ret - today) / 86_400_000));
  const daysElapsed = Math.max(0, LOAN_DURATION_DAYS - daysRemaining);
  const progressPct = Math.max(0, Math.min(100, Math.round((daysElapsed / LOAN_DURATION_DAYS) * 100)));
  return { daysElapsed, daysRemaining, progressPct };
}
