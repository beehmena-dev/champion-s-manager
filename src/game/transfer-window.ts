// -----------------------------------------------------------------------------
// Janela de transferência — lógica pura (sem I/O).
//
// Item 04 do backlog FootSim: "a janela de transferência vale só pra
// negociação clube-clube. Agente livre pode ser assinado a qualquer
// momento." Antes deste módulo não existia NENHUM conceito de janela no
// motor — negociar era possível o ano inteiro pra qualquer jogador. Isso é
// a peça que faltava: 2 janelas por temporada (verão e inverno, como nas
// ligas de verdade), que travam só compra/venda ENTRE clubes — agente livre
// (ver signFreeAgent em src/lib/transfer-offers.ts) nunca passa por aqui.
// -----------------------------------------------------------------------------

export interface TransferWindow {
  label: string;
  startMonth: number; // 1-12
  startDay: number;
  endMonth: number;
  endDay: number;
}

export const TRANSFER_WINDOWS: TransferWindow[] = [
  { label: "Janela de verão", startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
  { label: "Janela de inverno", startMonth: 1, startDay: 1, endMonth: 1, endDay: 31 },
];

function monthDay(dateISO: string): [number, number] {
  return [Number(dateISO.slice(5, 7)), Number(dateISO.slice(8, 10))];
}

function inWindow(month: number, day: number, w: TransferWindow): boolean {
  const md = month * 100 + day;
  return md >= w.startMonth * 100 + w.startDay && md <= w.endMonth * 100 + w.endDay;
}

export function isTransferWindowOpen(dateISO: string): boolean {
  const [month, day] = monthDay(dateISO);
  return TRANSFER_WINDOWS.some((w) => inWindow(month, day, w));
}

export function currentWindowLabel(dateISO: string): string | null {
  const [month, day] = monthDay(dateISO);
  return TRANSFER_WINDOWS.find((w) => inWindow(month, day, w))?.label ?? null;
}

/** Quantos dias faltam pra próxima janela abrir (0 se já está aberta agora). */
export function daysUntilNextWindow(dateISO: string): number {
  if (isTransferWindowOpen(dateISO)) return 0;
  const today = new Date(dateISO + "T00:00:00Z");
  let best = Infinity;
  for (const w of TRANSFER_WINDOWS) {
    for (const yearOffset of [0, 1]) {
      const year = today.getUTCFullYear() + yearOffset;
      const start = new Date(Date.UTC(year, w.startMonth - 1, w.startDay));
      const diffDays = Math.round((start.getTime() - today.getTime()) / 86_400_000);
      if (diffDays >= 0 && diffDays < best) best = diffDays;
    }
  }
  return best === Infinity ? 0 : best;
}
