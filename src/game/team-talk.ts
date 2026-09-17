// -----------------------------------------------------------------------------
// Preleção (team talk) — ANTES do apito inicial, o técnico escolhe UM tom para
// falar ao elenco. Complementa o grito de beira de campo (src/game/shouts.ts),
// que acontece no intervalo: a preleção mexe na moral usada só pela simulação
// do 1º tempo (transiente, não persiste — a moral "de verdade" muda pelo
// resultado, em advance-day). Determinístico pela situação pré-jogo
// (favorito/azarão + mando), no mesmo espírito dos gritos: o jogador aprende
// as regras. Ver src/lib/live-match.ts (startMatchFirstHalf) e o diálogo em
// src/routes/_authenticated/saves.$saveId.tsx.
// -----------------------------------------------------------------------------
export type TeamTalkId = "believe" | "demand" | "calm" | "aggressive" | "no_pressure";

export interface TeamTalk {
  id: TeamTalkId;
  label: string;
  hint: string;
}

export const TEAM_TALKS: TeamTalk[] = [
  { id: "believe", label: "Confio em vocês", hint: "Empurrão seguro e pequeno. Rende um pouco mais como azarão." },
  { id: "demand", label: "Exijo uma resposta", hint: "Acende o time como azarão; soa deslocado sendo favorito em casa." },
  { id: "calm", label: "Joguem o nosso jogo", hint: "Serenidade — melhor fora de casa ou contra time mais forte." },
  { id: "aggressive", label: "Pressão desde o apito", hint: "Ótimo favorito em casa; arrogante como azarão fora." },
  { id: "no_pressure", label: "Sem pressão, aproveitem", hint: "Liberta o azarão sem nada a perder; relaxa demais quem é favorito." },
];

/** favourite: 1 = favorito claro, 0 = jogo equilibrado, -1 = azarão claro. */
export interface TeamTalkContext {
  isHome: boolean;
  favourite: -1 | 0 | 1;
}

/**
 * Ajuste de moral (transiente, só 1º tempo) + fala de retorno do vestiário.
 */
export function resolveTeamTalk(
  id: TeamTalkId,
  ctx: TeamTalkContext,
): { moraleShift: number; response: string } {
  const underdog = ctx.favourite < 0;
  const favourite = ctx.favourite > 0;

  switch (id) {
    case "believe":
      return underdog
        ? { moraleShift: 4, response: "O voto de confiança pegou bem num grupo que se sabia azarão." }
        : { moraleShift: 3, response: "O elenco recebeu a mensagem de confiança com naturalidade." };
    case "demand":
      if (underdog) return { moraleShift: 5, response: "A cobrança acendeu o time — entraram com sangue nos olhos." };
      if (favourite && ctx.isHome) return { moraleShift: -4, response: "Cobrar tanto sendo favorito em casa passou insegurança pro grupo." };
      return { moraleShift: 1, response: "A exigência foi ouvida com atenção." };
    case "calm":
      if (!ctx.isHome || underdog) return { moraleShift: 4, response: "O pedido de serenidade tranquilizou o time pra um jogo difícil." };
      return { moraleShift: 1, response: "O elenco assimilou o recado de manter a calma." };
    case "aggressive":
      if (favourite && ctx.isHome) return { moraleShift: 5, response: "O time comprou a ideia de sufocar o adversário desde o início." };
      if (underdog && !ctx.isHome) return { moraleShift: -3, response: "Prometer pressão total fora e como azarão soou irreal aos jogadores." };
      return { moraleShift: 1, response: "O grupo topou entrar pressionando." };
    case "no_pressure":
      if (underdog) return { moraleShift: 5, response: "Tirar o peso das costas soltou o time — nada a perder." };
      if (favourite) return { moraleShift: -4, response: "Aliviar a responsabilidade sendo favorito deixou o time acomodado." };
      return { moraleShift: 1, response: "A mensagem de leveza foi bem recebida." };
  }
}
