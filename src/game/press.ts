// -----------------------------------------------------------------------------
// Coletivas de imprensa — lógica pura (sem I/O).
//
// Antes da partida do usuário e depois dela (o tom muda conforme o
// resultado), o jornalista faz uma pergunta e o usuário escolhe como
// responder — cada resposta mexe um pouco na moral do elenco
// (clubs.morale, já usado em src/lib/advance-day.ts).
// -----------------------------------------------------------------------------

export type PressContext = "pre_match" | "post_match_win" | "post_match_draw" | "post_match_loss";

export interface PressAnswerOption {
  id: string;
  text: string;
  moraleDelta: number;
}

export interface PressQuestion {
  id: string;
  text: string;
  options: PressAnswerOption[];
}

const PRE_MATCH_QUESTIONS: PressQuestion[] = [
  {
    id: "pre_confidence",
    text: "Como está a confiança do elenco pro jogo de hoje?",
    options: [
      { id: "bold", text: "Vamos com tudo pra vencer.", moraleDelta: 3 },
      { id: "measured", text: "Respeitamos o adversário, mas confiamos no nosso trabalho.", moraleDelta: 1 },
      { id: "cautious", text: "Um jogo difícil, vamos com cautela.", moraleDelta: -1 },
    ],
  },
  {
    id: "pre_pressure",
    text: "Sente pressão da torcida pra esse resultado?",
    options: [
      { id: "deflect", text: "Pressão é privilégio de quem briga por objetivos grandes.", moraleDelta: 2 },
      { id: "honest", text: "Sim, e vamos usar isso a nosso favor.", moraleDelta: 1 },
      { id: "dismiss", text: "Não penso nisso, só no próximo treino.", moraleDelta: 0 },
    ],
  },
  {
    id: "pre_lineup",
    text: "O time vai a campo com força máxima?",
    options: [
      { id: "yes", text: "Sim, melhor equipe possível pra esse jogo.", moraleDelta: 2 },
      { id: "rotation", text: "Vamos poupar alguns nomes de olho na sequência.", moraleDelta: -1 },
      { id: "no_comment", text: "Isso a gente só confirma na hora.", moraleDelta: 0 },
    ],
  },
];

const POST_MATCH_WIN_QUESTIONS: PressQuestion[] = [
  {
    id: "win_credit",
    text: "A que você atribui a vitória de hoje?",
    options: [
      { id: "team", text: "Mérito total do grupo, treinaram muito pra isso.", moraleDelta: 4 },
      { id: "plan", text: "A estratégia deu certo do jeito que planejamos.", moraleDelta: 2 },
      { id: "modest", text: "Foi um jogo difícil, ganhamos com trabalho.", moraleDelta: 1 },
    ],
  },
  {
    id: "win_next",
    text: "Dá pra sonhar mais alto depois desse resultado?",
    options: [
      { id: "yes", text: "Sim, esse grupo pode brigar por muita coisa.", moraleDelta: 3 },
      { id: "step_by_step", text: "Um jogo de cada vez, sem pular etapas.", moraleDelta: 1 },
      { id: "cautious", text: "Cedo pra falar nisso, foco no próximo jogo.", moraleDelta: 0 },
    ],
  },
];

const POST_MATCH_DRAW_QUESTIONS: PressQuestion[] = [
  {
    id: "draw_result",
    text: "Esse empate foi um resultado justo?",
    options: [
      { id: "positive", text: "Um ponto importante fora de casa, saio satisfeito.", moraleDelta: 2 },
      { id: "neutral", text: "Justo pelo que os dois times mostraram.", moraleDelta: 0 },
      { id: "frustrated", text: "Deveríamos ter vencido, faltou capricho.", moraleDelta: -2 },
    ],
  },
];

const POST_MATCH_LOSS_QUESTIONS: PressQuestion[] = [
  {
    id: "loss_reaction",
    text: "Como explica essa derrota?",
    options: [
      { id: "protect", text: "O grupo deu tudo, vai virar essa chave rápido.", moraleDelta: 2 },
      { id: "honest", text: "Fomos inferiores hoje, precisamos evoluir.", moraleDelta: -1 },
      { id: "critical", text: "Faltou entrega de alguns jogadores em campo.", moraleDelta: -4 },
    ],
  },
];

const QUESTIONS_BY_CONTEXT: Record<PressContext, PressQuestion[]> = {
  pre_match: PRE_MATCH_QUESTIONS,
  post_match_win: POST_MATCH_WIN_QUESTIONS,
  post_match_draw: POST_MATCH_DRAW_QUESTIONS,
  post_match_loss: POST_MATCH_LOSS_QUESTIONS,
};

export function pickPressQuestion(context: PressContext, rng: () => number = Math.random): PressQuestion {
  const pool = QUESTIONS_BY_CONTEXT[context];
  return pool[Math.floor(rng() * pool.length)];
}

export function pressContextForResult(myScore: number, opponentScore: number): PressContext {
  if (myScore > opponentScore) return "post_match_win";
  if (myScore < opponentScore) return "post_match_loss";
  return "post_match_draw";
}
