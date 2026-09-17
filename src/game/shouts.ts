// -----------------------------------------------------------------------------
// Gritos de beira de campo — no intervalo, o técnico escolhe UM recado para o
// vestiário. O efeito é um ajuste transiente de moral só para o 2º tempo (não
// persiste no banco), calculado a partir da situação do placar no intervalo —
// determinístico, como no protótipo do AI Studio (o jogador aprende as regras).
// Ver src/lib/live-match.ts (finishMatchSecondHalf) e o painel de intervalo em
// src/routes/_authenticated/saves.$saveId.tsx.
// -----------------------------------------------------------------------------
export type ShoutId = "demand" | "encourage" | "calm" | "praise" | "focus" | "push";

export interface Shout {
  id: ShoutId;
  label: string;
  hint: string;
}

export const SHOUTS: Shout[] = [
  { id: "demand", label: "Exigir mais", hint: "Funciona quando o time está devendo; irrita quem já vence com folga." },
  { id: "encourage", label: "Incentivar", hint: "Empurrãozinho seguro, efeito pequeno." },
  { id: "calm", label: "Acalmar", hint: "Estabiliza quando se está à frente; pouco efeito atrás no placar." },
  { id: "praise", label: "Elogiar a equipe", hint: "Ótimo vencendo; arriscado perdendo — soa deslocado." },
  { id: "focus", label: "Foco total", hint: "Reduz lapsos de concentração. Efeito modesto e sem risco." },
  { id: "push", label: "Avançar as linhas", hint: "Empurra o time pra frente. Rende atrás no placar, expõe quem já vence." },
];

/**
 * Ajuste de moral (transiente, só 2º tempo) + fala de retorno do vestiário.
 * `margin` = meus gols − gols sofridos ao fim do 1º tempo.
 */
export function resolveShout(id: ShoutId, margin: number): { moraleShift: number; response: string } {
  const losing = margin < 0;
  const drawing = margin === 0;
  const winningBig = margin >= 2;

  switch (id) {
    case "demand":
      if (losing || drawing) return { moraleShift: 6, response: "O time reagiu à cobrança e voltou ligado para o segundo tempo." };
      if (winningBig) return { moraleShift: -5, response: "Os jogadores não entenderam a cobrança vencendo com folga e ficaram irritados." };
      return { moraleShift: 2, response: "A cobrança foi ouvida com atenção." };
    case "encourage":
      return { moraleShift: 3, response: "Palavra de incentivo bem recebida pelo elenco." };
    case "calm":
      if (margin > 0) return { moraleShift: 4, response: "O time entendeu o recado de segurar o resultado com tranquilidade." };
      if (losing) return { moraleShift: -1, response: "Pedir calma atrás no placar não animou ninguém." };
      return { moraleShift: 1, response: "O elenco assimilou o pedido de manter a serenidade." };
    case "praise":
      if (margin > 0) return { moraleShift: 6, response: "O elogio deixou o grupo confiante para fechar o jogo." };
      if (losing) return { moraleShift: -4, response: "Elogiar perdendo soou deslocado e passou a mensagem errada." };
      return { moraleShift: 1, response: "O reconhecimento foi recebido com naturalidade." };
    case "focus":
      return { moraleShift: 2, response: "O time voltou concentrado, atento aos detalhes defensivos." };
    case "push":
      if (losing) return { moraleShift: 5, response: "O time assumiu o risco e voltou disposto a pressionar." };
      if (winningBig) return { moraleShift: -3, response: "Empurrar o time à frente vencendo com folga soou temerário aos jogadores." };
      return { moraleShift: 2, response: "O elenco topou adiantar as linhas no segundo tempo." };
  }
}
