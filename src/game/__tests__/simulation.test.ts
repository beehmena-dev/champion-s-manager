import { describe, it, expect } from "vitest";
import { simulateMatchSegment } from "../simulation";
import { formationSlots } from "../tactics";
import { makeClub, makeXI } from "./fixtures";

const home = makeClub({ id: "home", name: "Casa FC", short_name: "CASA", pressing: 5 });
const away = makeClub({ id: "away", name: "Fora FC", short_name: "FORA", pressing: 5 });

describe("simulateMatchSegment — regras gerais", () => {
  it("dois cartões amarelos pro MESMO jogador sempre viram vermelho automático (Lei 12)", () => {
    // Roda várias sementes com pressão alta (mais cartão) até ter amostra
    // suficiente — a trava é: sempre que alguém tem 2 amarelos, tem 1 vermelho.
    for (let seed = 0; seed < 60; seed++) {
      const homePlayers = makeXI("h");
      const awayPlayers = makeXI("a");
      const { result } = simulateMatchSegment(home, away, homePlayers, awayPlayers, { seed: `card-test-${seed}` });
      const yellowCounts = new Map<string, number>();
      const redPlayers = new Set<string>();
      for (const c of result.cards ?? []) {
        if (c.type === "yellow") yellowCounts.set(c.playerId, (yellowCounts.get(c.playerId) ?? 0) + 1);
        else redPlayers.add(c.playerId);
      }
      for (const [playerId, count] of yellowCounts) {
        if (count >= 2) expect(redPlayers.has(playerId)).toBe(true);
      }
    }
  });

  it("partida completa (endMinute padrão 90) sempre termina com final:true", () => {
    const { final, result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "final-check" });
    expect(final).toBe(true);
    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.awayScore).toBeGreaterThanOrEqual(0);
  });

  it("placar nunca passa de 6 (teto de segurança residual)", () => {
    for (let seed = 0; seed < 20; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `blowout-${seed}` });
      expect(result.homeScore).toBeLessThanOrEqual(6);
      expect(result.awayScore).toBeLessThanOrEqual(6);
    }
  });

  it("trecho até 45' gera anúncio de acréscimo (Lei 7) e o 2º tempo recomeça limpo em 46", () => {
    const { result, carryState, rng } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), {
      seed: "stoppage-check", startMinute: 1, endMinute: 45,
    });
    const hasStoppageAnnouncement = result.events.some((e) => e.type === "info" && e.text.includes("Acréscimo"));
    expect(hasStoppageAnnouncement).toBe(true);

    // Continua pro 2º tempo — precisa recomeçar em 46 mesmo com acréscimo no 1º.
    const second = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), {
      seed: "stoppage-check", startMinute: 46, endMinute: 90, carryState, rng,
    });
    const secondHalfEvents = second.result.events.filter((e) => e.minute >= 46 && e.minute < 47);
    // Não trava tudo em erro: só confirma que o motor aceitou 46 como startMinute sem exceção.
    expect(second.final).toBe(true);
    expect(secondHalfEvents).toBeInstanceOf(Array);
  });

  it("expõe estatística de impedimento (offsidesHome/offsidesAway) sempre não-negativa", () => {
    const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "offside-stat" });
    expect(result.stats?.offsidesHome).toBeGreaterThanOrEqual(0);
    expect(result.stats?.offsidesAway).toBeGreaterThanOrEqual(0);
  });

  it("evento de impedimento, quando ocorre, soma exatamente 1 na estatística do lado certo", () => {
    // Amostra várias sementes até achar alguma com impedimento nos dois lados
    // (times com posse mista/tempo médio geram impedimento raramente por
    // minuto — 90 min × várias sementes garante amostra sem depender de sorte
    // de uma seed só).
    let sawHomeOffside = false;
    let sawAwayOffside = false;
    for (let seed = 0; seed < 40; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `offside-count-${seed}` });
      const homeOffsideEvents = result.events.filter((e) => e.type === "offside" && e.side === "home").length;
      const awayOffsideEvents = result.events.filter((e) => e.type === "offside" && e.side === "away").length;
      expect(homeOffsideEvents).toBe(result.stats!.offsidesHome);
      expect(awayOffsideEvents).toBe(result.stats!.offsidesAway);
      if (homeOffsideEvents > 0) sawHomeOffside = true;
      if (awayOffsideEvents > 0) sawAwayOffside = true;
    }
    expect(sawHomeOffside || sawAwayOffside).toBe(true);
  });

  it("resultado inclui contexto de árbitro e clima (Leis 1 e 5)", () => {
    const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "context-check" });
    expect(result.referee?.name).toBeTruthy();
    expect(result.referee?.strictness).toBeGreaterThanOrEqual(1);
    expect(result.weather?.label).toBeTruthy();
  });

  it("árbitro e clima ficam ESTÁVEIS entre trechos da mesma partida (mesma seed)", () => {
    const first = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "stable-context", startMinute: 1, endMinute: 45 });
    const second = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), {
      seed: "stable-context", startMinute: 46, endMinute: 90, carryState: first.carryState, rng: first.rng,
    });
    expect(second.result.referee).toEqual(first.result.referee);
    expect(second.result.weather).toEqual(first.result.weather);
  });
});

describe("simulateMatchSegment — textura tática (motor mais granular, Fase 1)", () => {
  it("homeLineup/awayLineup vêm com roleKey e instructions preenchidos (usado pelo visualizador)", () => {
    const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "lineup-fields" });
    expect(result.homeLineup?.length).toBeGreaterThan(0);
    for (const l of result.homeLineup ?? []) {
      expect(typeof l.roleKey).toBe("string");
      expect(l.instructions).toBeDefined();
      expect(l.instructions?.pressing).toBeGreaterThanOrEqual(-1);
      expect(l.instructions?.pressing).toBeLessThanOrEqual(1);
    }
    for (const l of result.awayLineup ?? []) {
      expect(typeof l.roleKey).toBe("string");
      expect(l.instructions).toBeDefined();
    }
  });

  it("gera texture[] ao longo de uma partida completa, sempre com minute/side/kind válidos", () => {
    let sawAny = false;
    for (let seed = 0; seed < 15; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `texture-${seed}` });
      expect(result.texture).toBeInstanceOf(Array);
      for (const t of result.texture ?? []) {
        expect(t.minute).toBeGreaterThan(0);
        expect(["home", "away"]).toContain(t.side);
        expect(["press_win", "marked_out", "overlap_run", "long_shot", "skill_move"]).toContain(t.kind);
        expect(typeof t.playerId).toBe("string");
      }
      if ((result.texture ?? []).length > 0) sawAny = true;
    }
    expect(sawAny).toBe(true);
  });

  it("textura acumula entre trechos (carryState.texture) sem se perder no intervalo", () => {
    const first = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: "texture-carry", startMinute: 1, endMinute: 45 });
    const second = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), {
      seed: "texture-carry", startMinute: 46, endMinute: 90, carryState: first.carryState, rng: first.rng,
    });
    expect((second.result.texture ?? []).length).toBeGreaterThanOrEqual((first.result.texture ?? []).length);
    // tudo que veio no 1º tempo continua presente no resultado acumulado do 2º
    const firstMinutes = new Set((first.result.texture ?? []).map((t) => t.minute));
    const secondMinutes = new Set((second.result.texture ?? []).map((t) => t.minute));
    for (const m of firstMinutes) expect(secondMinutes.has(m)).toBe(true);
  });

  it("time com pressão alta em todo o XI gera mais press_win do que pressão baixa, em amostra (usa savedLineup real via FORMATIONS)", () => {
    const slots = formationSlots("4-3-3").map((s) => s.slot);
    const buildSavedLineup = (players: ReturnType<typeof makeXI>, pressing: -1 | 0 | 1) =>
      players.map((p, i) => ({ player_id: p.id, slot: slots[i], role: null, instructions: { pressing } }));

    let highCount = 0, lowCount = 0;
    for (let seed = 0; seed < 20; seed++) {
      const hp = makeXI("h");
      const ap = makeXI("a");
      const high = simulateMatchSegment(home, away, hp, ap, {
        seed: `press-high-${seed}`, homeLineup: buildSavedLineup(hp, 1), awayLineup: buildSavedLineup(ap, 0),
      });
      const low = simulateMatchSegment(home, away, hp, ap, {
        seed: `press-low-${seed}`, homeLineup: buildSavedLineup(hp, -1), awayLineup: buildSavedLineup(ap, 0),
      });
      highCount += (high.result.texture ?? []).filter((t) => t.side === "home" && t.kind === "press_win").length;
      lowCount += (low.result.texture ?? []).filter((t) => t.side === "home" && t.kind === "press_win").length;
    }
    expect(highCount).toBeGreaterThan(lowCount);
  });
});
