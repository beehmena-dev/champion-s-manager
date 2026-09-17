import { describe, it, expect } from "vitest";
import { defensivePressN, applyTextureAnims, computePlayerPositions, computeBallPosition, TEXTURE_ANIM_WINDOW, type LiveDot } from "../live-positions";
import type { MatchLineupEntry, MatchEvent, FormationCode } from "../types";
import { DEFAULT_INSTRUCTIONS } from "../player-instructions";
import type { TextureEvent } from "../texture";

describe("defensivePressN — instrução de Pressão desloca o limiar de marcação alta", () => {
  it("pressão alta (+1) dispara marcação em advance mais baixo que pressão neutra", () => {
    // Num ponto onde a instrução neutra ainda não pressiona (0 jogadores),
    // pressão alta já deve mandar pelo menos 1 pra cima.
    expect(defensivePressN(0.5, 1)).toBeGreaterThan(defensivePressN(0.5, 0));
  });

  it("pressão baixa (-1) atrasa a marcação em relação à neutra", () => {
    expect(defensivePressN(0.5, -1)).toBeLessThanOrEqual(defensivePressN(0.5, 0));
  });

  it("nos extremos de advance (0 ou 1), o resultado nunca sai do intervalo 0..2", () => {
    for (const adv of [0, 0.1, 0.4, 0.6, 0.9, 1]) {
      for (const press of [-1, 0, 1]) {
        const n = defensivePressN(adv, press);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(2);
      }
    }
  });
});

// Fixtures mínimas pra exercer computePlayerPositions/computeBallPosition de
// ponta a ponta sem quebrar em lineups sem instructions/roleKey (partidas já
// salvas no banco antes desses campos existirem).
function makeLineup(prefix: string): MatchLineupEntry[] {
  const slots = ["GK", "LB", "LCB", "RCB", "RB", "DM", "LCM", "RCM", "LW", "ST", "RW"];
  return slots.map((slot, i) => ({ slot, playerId: `${prefix}-${i}`, playerName: `${prefix} ${i}` }));
}

describe("MatchLineupEntry sem instructions/roleKey (dado antigo) nunca quebra o visualizador", () => {
  const homeLineup = makeLineup("home");
  const awayLineup = makeLineup("away");
  const formation: FormationCode = "4-3-3";
  const events: MatchEvent[] = [
    { minute: 10, type: "chance", side: "home", text: "10' Chance para o mandante." },
  ];

  it("computePlayerPositions devolve 22 posições válidas em vários minutos", () => {
    for (const minute of [0, 15, 45, 60, 89]) {
      const dots = computePlayerPositions(homeLineup, awayLineup, formation, formation, minute, events, 55);
      expect(dots.length).toBe(22);
      for (const d of dots) {
        expect(Number.isFinite(d.x)).toBe(true);
        expect(Number.isFinite(d.y)).toBe(true);
        expect(d.x).toBeGreaterThanOrEqual(0);
        expect(d.x).toBeLessThanOrEqual(100);
        expect(d.y).toBeGreaterThanOrEqual(0);
        expect(d.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("computeBallPosition devolve coordenadas válidas", () => {
    const ball = computeBallPosition(events, 30, 55, homeLineup, awayLineup, formation, formation);
    expect(Number.isFinite(ball.x)).toBe(true);
    expect(Number.isFinite(ball.y)).toBe(true);
  });
});

describe("MatchLineupEntry COM instructions/roleKey também nunca quebra", () => {
  it("computePlayerPositions aceita instructions/roleKey populados sem lançar erro", () => {
    const homeLineup: MatchLineupEntry[] = makeLineup("home").map((l, i) => ({
      ...l,
      roleKey: i === 1 ? "fb_attack" : undefined,
      instructions: i === 1 ? { ...DEFAULT_INSTRUCTIONS, pressing: 1, roamWidth: 1, roamDepth: 1 } : undefined,
    }));
    const awayLineup = makeLineup("away");
    const formation: FormationCode = "4-3-3";
    expect(() => computePlayerPositions(homeLineup, awayLineup, formation, formation, 40, [], 50)).not.toThrow();
  });
});

describe("applyTextureAnims — Fase 2 (micro-eventos viram pose/deslocamento visível)", () => {
  function makeDots(): LiveDot[] {
    return [
      { playerId: "presser", playerName: "Presser", slot: "DM", side: "home", x: 50, y: 50 },
      { playerId: "victim", playerName: "Victim", slot: "CM", side: "away", x: 52, y: 48 },
      { playerId: "runner", playerName: "Runner", slot: "RB", side: "home", x: 80, y: 50 },
      { playerId: "shooter", playerName: "Shooter", slot: "ST", side: "away", x: 30, y: 20 },
    ];
  }

  it("press_win: a vítima (targetId) fica 'dejected' dentro da janela, e some fora dela", () => {
    const ev: TextureEvent = { minute: 10, side: "home", kind: "press_win", playerId: "presser", targetId: "victim" };
    const dotsInside = makeDots();
    applyTextureAnims(dotsInside, [ev], 10.5);
    expect(dotsInside.find((d) => d.playerId === "victim")?.anim).toBe("dejected");

    const dotsOutside = makeDots();
    applyTextureAnims(dotsOutside, [ev], 10 + TEXTURE_ANIM_WINDOW + 0.5);
    expect(dotsOutside.find((d) => d.playerId === "victim")?.anim).toBeUndefined();
  });

  it("marked_out: só aplica 'dejected' no marcado quando o marcador VENCEU (won:true)", () => {
    const won: TextureEvent = { minute: 20, side: "away", kind: "marked_out", playerId: "presser", targetId: "victim", won: true };
    const lost: TextureEvent = { minute: 20, side: "away", kind: "marked_out", playerId: "presser", targetId: "victim", won: false };
    const dotsWon = makeDots();
    applyTextureAnims(dotsWon, [won], 20.2);
    expect(dotsWon.find((d) => d.playerId === "victim")?.anim).toBe("dejected");

    const dotsLost = makeDots();
    applyTextureAnims(dotsLost, [lost], 20.2);
    expect(dotsLost.find((d) => d.playerId === "victim")?.anim).toBeUndefined();
  });

  it("long_shot: o autor ganha a pose 'shoot'", () => {
    const ev: TextureEvent = { minute: 30, side: "away", kind: "long_shot", playerId: "shooter" };
    const dots = makeDots();
    applyTextureAnims(dots, [ev], 30.1);
    expect(dots.find((d) => d.playerId === "shooter")?.anim).toBe("shoot");
  });

  it("skill_move: driblador vencedor fica sem pose própria, defensor marcado fica 'dejected'; se perde, o driblador é que fica 'dejected'", () => {
    const won: TextureEvent = { minute: 40, side: "home", kind: "skill_move", playerId: "runner", targetId: "victim", won: true };
    const dotsWon = makeDots();
    applyTextureAnims(dotsWon, [won], 40.1);
    expect(dotsWon.find((d) => d.playerId === "victim")?.anim).toBe("dejected");
    expect(dotsWon.find((d) => d.playerId === "runner")?.anim).toBeUndefined();

    const lost: TextureEvent = { minute: 40, side: "home", kind: "skill_move", playerId: "runner", targetId: "victim", won: false };
    const dotsLost = makeDots();
    applyTextureAnims(dotsLost, [lost], 40.1);
    expect(dotsLost.find((d) => d.playerId === "runner")?.anim).toBe("dejected");
  });

  it("overlap_run: desloca a posição do jogador (avança e depois volta), sem setar pose", () => {
    const ev: TextureEvent = { minute: 50, side: "home", kind: "overlap_run", playerId: "runner" };
    const base = makeDots().find((d) => d.playerId === "runner")!.y;

    const early = makeDots();
    applyTextureAnims(early, [ev], 50.05);
    const mid = makeDots();
    applyTextureAnims(mid, [ev], 50 + TEXTURE_ANIM_WINDOW / 2);
    const late = makeDots();
    applyTextureAnims(late, [ev], 50 + TEXTURE_ANIM_WINDOW - 0.05);

    const yEarly = early.find((d) => d.playerId === "runner")!.y;
    const yMid = mid.find((d) => d.playerId === "runner")!.y;
    const yLate = late.find((d) => d.playerId === "runner")!.y;

    // pico no meio da janela, volta perto do original nas pontas — a curva é
    // simétrica (seno), então o deslocamento no meio é bem maior que nas bordas.
    expect(Math.abs(yMid - base)).toBeGreaterThan(Math.abs(yEarly - base));
    expect(Math.abs(yMid - base)).toBeGreaterThan(Math.abs(yLate - base));
    expect(early.find((d) => d.playerId === "runner")?.anim).toBeUndefined();
  });

  it("um evento real (goal/injury, via applyEventAnims) sempre pode sobrescrever a pose de textura — computePlayerPositions chama textura ANTES do evento real", () => {
    // Regressão de ordem: se isso um dia inverter, uma pose de textura como
    // "dejected" poderia ficar presa por cima de uma comemoração de gol.
    const homeLineup: MatchLineupEntry[] = [
      { slot: "GK", playerId: "gk-h", playerName: "GK H" },
      { slot: "ST", playerId: "scorer", playerName: "Scorer" },
    ];
    const awayLineup: MatchLineupEntry[] = [
      { slot: "GK", playerId: "gk-a", playerName: "GK A" },
      { slot: "CM", playerId: "victim", playerName: "Victim" },
    ];
    const events: MatchEvent[] = [{ minute: 10, type: "goal", side: "home", playerId: "scorer", text: "10' GOL" }];
    const texture: TextureEvent[] = [{ minute: 10, side: "home", kind: "press_win", playerId: "scorer", targetId: "victim" }];
    const dots = computePlayerPositions(homeLineup, awayLineup, "4-3-3", "4-3-3", 10.5, events, 50, texture);
    // vítima do press_win é do lado away, que sofreu o gol → "dejected" pelo
    // evento real (não é o "dejected" de textura, mas o resultado visual bate).
    const victimDot = dots.find((d) => d.playerId === "victim");
    expect(victimDot?.anim).toBe("dejected");
    const scorerDot = dots.find((d) => d.playerId === "scorer");
    expect(scorerDot?.anim).toBe("celebrate");
  });
});

describe("Team Fluidity — 'fluid' solta mais o time da posição fixa que 'structured'", () => {
  const buildLineup = (fluidity: "structured" | "fluid"): MatchLineupEntry[] =>
    makeLineup("home").map((l) => ({ ...l, teamFluidity: fluidity }));
  const awayLineup = makeLineup("away");
  const formation: FormationCode = "4-3-3";
  const events: MatchEvent[] = [];
  const targetId = "home-6"; // LCM — jogador de linha, não goleiro

  it("no ataque, um jogador de linha oscila com amplitude maior em 'fluid' do que em 'structured', mesma cena", () => {
    // Formação/bola/eventos idênticos nos 2 lados — a ÚNICA diferença é
    // teamFluidity. buildOpenPlay soma um termo de oscilação individual
    // (Math.cos/sin(minute*k + fase) * runAmp) por cima da posição-alvo — o
    // range (máx-mín) dessa oscilação ao longo de vários minutos é um proxy
    // direto e estável do runAmp efetivo, sem precisar expor buildOpenPlay.
    // Minutos escolhidos (checado via instrumentação pontual) caem todos
    // numa janela em que home-6 está sempre atacando nesta cena — 10-14 caem
    // numa jogada defensiva (ver teste abaixo) e 24 cai numa bola parada
    // (outro código, sem essa oscilação), por isso ficam de fora daqui.
    function rangeFor(fluidity: "structured" | "fluid"): number {
      const homeLineup = buildLineup(fluidity);
      const ys = [16, 18, 20, 22, 26, 28, 30].map((minute) => {
        const dots = computePlayerPositions(homeLineup, awayLineup, formation, formation, minute, events, 50);
        return dots.find((d) => d.playerId === targetId)!.y;
      });
      return Math.max(...ys) - Math.min(...ys);
    }

    const structuredRange = rangeFor("structured");
    const fluidRange = rangeFor("fluid");
    expect(fluidRange).toBeGreaterThan(structuredRange);
  });

  it("na defesa, o bloco de um time 'fluid' fica mais adiantado que o de um 'structured', mesma cena", () => {
    // Item novo (achado ao vivo, partida real Metz × PSG): a fluidez do time
    // também precisa valer quando o time DEFENDE, não só quando ataca — antes
    // dessa correção a fase defensiva ignorava teamFluidity por completo.
    // Minutos 10-14 (checados via instrumentação pontual) caem numa jogada em
    // que home-6 está sempre defendendo nesta cena.
    function yAt(fluidity: "structured" | "fluid", minute: number): number {
      const homeLineup = buildLineup(fluidity);
      const dots = computePlayerPositions(homeLineup, awayLineup, formation, formation, minute, events, 50);
      return dots.find((d) => d.playerId === targetId)!.y;
    }
    for (const minute of [10, 12, 14]) {
      // y menor (mais perto do gol adversário) = bloco mais adiantado — mando
      // é "home", então avançar significa reduzir y (ver depthY/toScreen).
      expect(yAt("fluid", minute)).toBeLessThan(yAt("structured", minute));
    }
  });

  it("nunca quebra quando teamFluidity está ausente (dado antigo, sem a coluna nova)", () => {
    const homeLineup = makeLineup("home");
    const awayLineup = makeLineup("away");
    expect(() => computePlayerPositions(homeLineup, awayLineup, "4-3-3", "4-3-3", 20, [], 50)).not.toThrow();
  });
});

describe("Bloco defensivo recuado não vira uma bolha (regressão achada ao vivo, Metz × PSG)", () => {
  // Antes desta correção, com um vão fixo de 15 entre lineY/midY, zagueiro,
  // lateral, ponta e atacante recuando caíam quase todos na MESMA faixa de
  // altura quando o time defendia bem recuado — 8 dos 10 jogadores de linha
  // espremidos em ~5 pontos percentuais, uma bolha em vez de um time. Cena
  // forçada por um evento real perto do minuto observado (goleiro defensor
  // fica perto do próprio gol, confirmando bloco recuado de verdade).
  it("zagueiro, lateral, meio e atacante ficam em faixas de altura claramente separadas quando o time defende recuado", () => {
    const homeLineup = makeLineup("home");
    const awayLineup = makeLineup("away");
    const formation: FormationCode = "4-3-3";
    const events: MatchEvent[] = [{ minute: 50, type: "goal", side: "away", text: "50' Gol do away" }];
    const minute = 49.9; // logo antes do evento — bola bem perto do gol do home, bloco recuado

    const dots = computePlayerPositions(homeLineup, awayLineup, formation, formation, minute, events, 50);
    const gk = dots.find((d) => d.side === "home" && d.slot === "GK")!;
    // confirma que a cena É de bloco recuado de verdade (goleiro perto do próprio gol).
    expect(gk.y).toBeGreaterThan(80);

    const byY = (slot: string) => dots.find((d) => d.side === "home" && d.slot === slot)!.y;
    const cb = byY("LCB"), fb = byY("LB"), dm = byY("DM"), st = byY("ST");
    // Ordem correta (mais recuado → mais adiantado) e, principalmente, SEPARAÇÃO
    // real entre as linhas — o bug original não tinha ordem errada, tinha
    // faixas colididas. `toBeGreaterThan` sozinho não pegaria isso de volta.
    const MIN_GAP = 4;
    expect(cb - fb).toBeGreaterThan(MIN_GAP);
    expect(fb - dm).toBeGreaterThan(MIN_GAP);
    expect(dm - st).toBeGreaterThan(MIN_GAP);
    // Vão total zagueiro→atacante bem maior que o vão de 15 usado antes (que
    // já não sobrava nada depois de repartido entre 4 bandas).
    expect(cb - st).toBeGreaterThan(20);
  });
});
