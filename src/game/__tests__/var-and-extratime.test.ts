import { describe, it, expect } from "vitest";
import { simulateMatchSegment } from "../simulation";
import { simulateExtraTimeFull, simulateExtraTimeQuick } from "../cup";
import { makeClub, makeXI } from "./fixtures";

const home = makeClub({ id: "home", name: "Casa FC", short_name: "CASA", pressing: 5 });
const away = makeClub({ id: "away", name: "Fora FC", short_name: "FORA", pressing: 5 });

describe("VAR (Lei 6) — desligado por padrão", () => {
  it("hasVar ausente/false nunca gera evento tipo \"var\" (liga só quando explicitamente pedido pela competição)", () => {
    for (let seed = 0; seed < 15; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `novar-${seed}` });
      expect(result.events.some((e) => e.type === "var")).toBe(false);
    }
  });
});

describe("VAR (Lei 6) — ligado (mata-mata)", () => {
  it("gol anulado pelo VAR sempre bate com a diferença entre gols marcados e anulados (placar nunca fica inconsistente)", () => {
    let sawAnyOverturn = false;
    for (let seed = 0; seed < 60; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `var-goal-${seed}`, hasVar: true });
      for (const side of ["home", "away"] as const) {
        const goalEvents = result.events.filter((e) => e.type === "goal" && e.side === side).length;
        const overturned = result.events.filter((e) => e.type === "var" && e.side === side && e.text.includes("ANULADO")).length;
        const expected = goalEvents - overturned;
        const actual = side === "home" ? result.homeScore : result.awayScore;
        expect(actual).toBe(expected);
        if (overturned > 0) sawAnyOverturn = true;
      }
    }
    expect(sawAnyOverturn).toBe(true);
  });

  it("vermelho rescindido pelo VAR sempre bate com o nº de cartões vermelhos que sobra no registro final", () => {
    // Vermelho DIRETO já é raro (~6% dos cartões), e só uma fração das
    // revisões rescinde — precisa de uma amostra grande pra ver o caso
    // acontecer pelo menos uma vez (o invariante abaixo é checado em TODA
    // amostra, aconteça ou não — a amostra grande é só pra garantir que o
    // caminho "aconteceu" seja exercitado também, não só o caminho comum).
    let sawAnyRescind = false;
    for (let seed = 0; seed < 1500; seed++) {
      const { result } = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), { seed: `var-red-${seed}`, hasVar: true });
      const directReds = result.events.filter((e) => e.type === "red" && e.text.includes("CARTÃO VERMELHO!")).length;
      const secondYellowReds = result.events.filter((e) => e.type === "red" && e.text.includes("Segundo amarelo")).length;
      const rescinded = result.events.filter((e) => e.type === "var" && e.text.includes("RESCINDIDO")).length;
      const redCardEntries = (result.cards ?? []).filter((c) => c.type === "red").length;
      expect(redCardEntries).toBe(directReds - rescinded + secondYellowReds);
      if (rescinded > 0) sawAnyRescind = true;
    }
    expect(sawAnyRescind).toBe(true);
  });
});

describe("Prorrogação (Lei 7) — src/game/cup.ts", () => {
  it("simulateExtraTimeFull roda 2×15min com VAR ligado e devolve só os gols DA prorrogação (0-based)", () => {
    const et = simulateExtraTimeFull(home, away, makeXI("h"), makeXI("a"), { seed: "et-full-1" });
    expect(et.homeGoals).toBeGreaterThanOrEqual(0);
    expect(et.awayGoals).toBeGreaterThanOrEqual(0);
    expect(et.homeGoals).toBeLessThanOrEqual(6);
    expect(et.events).toBeDefined();
    // Todo evento de prorrogação tem minuto >= 91 (nunca vaza pro "tempo normal").
    for (const e of et.events ?? []) expect(e.minute).toBeGreaterThanOrEqual(91);
  });

  it("simulateExtraTimeQuick (confrontos só-IA) é determinístico pela seed e não tem eventos", () => {
    const a = simulateExtraTimeQuick(70, 60, "et-quick-seed");
    const b = simulateExtraTimeQuick(70, 60, "et-quick-seed");
    expect(a).toEqual(b);
    expect(a.events).toBeUndefined();
  });

  it("time bem mais forte tende a marcar mais gols de prorrogação que um time bem mais fraco (não é 50/50 puro)", () => {
    let strongTotal = 0, weakTotal = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = simulateExtraTimeQuick(90, 40, `et-strength-${seed}`);
      strongTotal += r.homeGoals; weakTotal += r.awayGoals;
    }
    expect(strongTotal).toBeGreaterThan(weakTotal);
  });

  it("acréscimo (Lei 7) também dispara nos limites da prorrogação (105'/120'), não só 45'/90'", () => {
    const seg = simulateMatchSegment(home, away, makeXI("h"), makeXI("a"), {
      seed: "et-stoppage", startMinute: 91, endMinute: 105, hasVar: true,
    });
    const hasStoppage = seg.result.events.some((e) => e.type === "info" && e.text.includes("Acréscimo"));
    expect(hasStoppage).toBe(true);
  });
});
