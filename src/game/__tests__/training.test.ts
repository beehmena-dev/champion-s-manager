import { describe, expect, it, vi } from "vitest";
import {
  applyTraining, resolveWeeklyFocus, countRestDays, REST_DAY_REGEN_BONUS,
  type TrainablePlayer, type WeeklySchedule,
} from "../training";
import { makeAttributes } from "./fixtures";

function player(overrides: Partial<TrainablePlayer> = {}): TrainablePlayer {
  return {
    id: overrides.id ?? "p1",
    age: overrides.age ?? 20,
    position: overrides.position ?? "MID",
    attributes: overrides.attributes ?? makeAttributes({}, 10),
    individual_training_focus: overrides.individual_training_focus,
    injured_until: overrides.injured_until,
  };
}

describe("resolveWeeklyFocus", () => {
  it("cai pro foco fixo quando não tem grade semanal", () => {
    expect(resolveWeeklyFocus(null, "attack", "2026-01-05")).toBe("attack");
    expect(resolveWeeklyFocus(undefined, "defense", "2026-01-05")).toBe("defense");
  });

  it("cai pro foco fixo quando a grade não tem os 7 dias", () => {
    const bad = ["attack", "defense"] as WeeklySchedule;
    expect(resolveWeeklyFocus(bad, "balanced", "2026-01-05")).toBe("balanced");
  });

  it("usa o dia certo da semana quando a grade tem 7 posições", () => {
    // 2026-01-04 é domingo (índice 0), 2026-01-10 é sábado (índice 6).
    const weekly: WeeklySchedule = ["rest", "attack", "defense", "physical", "technical", "goalkeeping", "balanced"];
    expect(resolveWeeklyFocus(weekly, "balanced", "2026-01-04")).toBe("rest");
    expect(resolveWeeklyFocus(weekly, "balanced", "2026-01-05")).toBe("attack");
    expect(resolveWeeklyFocus(weekly, "balanced", "2026-01-10")).toBe("balanced");
  });
});

describe("countRestDays", () => {
  it("0 sem grade semanal (foco fixo nunca é 'rest')", () => {
    expect(countRestDays(null, "attack", "2026-01-04", 7)).toBe(0);
  });

  it("conta os dias de descanso certos numa semana cheia", () => {
    const weekly: WeeklySchedule = ["rest", "attack", "rest", "physical", "technical", "goalkeeping", "rest"];
    expect(countRestDays(weekly, "balanced", "2026-01-04", 7)).toBe(3);
  });

  it("conta em janelas menores que 7 dias também", () => {
    const weekly: WeeklySchedule = ["rest", "attack", "rest", "physical", "technical", "goalkeeping", "rest"];
    // 2026-01-04 (dom, rest) + 2026-01-05 (seg, attack) só
    expect(countRestDays(weekly, "balanced", "2026-01-04", 2)).toBe(1);
  });
});

describe("applyTraining — dias de descanso não treinam nada e não rolam risco", () => {
  it("um jogador só com dias de descanso não gera nenhum patch, mesmo com rng que sempre 'acerta'", () => {
    const alwaysSucceed = () => 0; // menor que qualquer chance/risco configurado
    const p = player({ id: "rester" });
    const patches = applyTraining([p], () => "rest", "2026-01-04", 7, 5, alwaysSucceed);
    expect(patches).toHaveLength(0);
  });

  it("o rng nunca é chamado num jogador que só descansa (nenhum dado é rolado, não é sorte)", () => {
    const spy = vi.fn(() => 0.999);
    const p = player({ id: "rester" });
    applyTraining([p], () => "rest", "2026-01-04", 7, 5, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it("foco individual 'rest' vence a grade do time nesse dia, mesmo o time treinando", () => {
    const spy = vi.fn(() => 0.999); // nunca ganha nada, só prova que não é chamado nos dias de rest
    const p = player({ id: "resting-star", individual_training_focus: "rest" });
    const patches = applyTraining([p], () => "attack", "2026-01-04", 5, 5, spy);
    expect(patches).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("applyTraining — individualMultiplier (mentoria, item 16 do backlog)", () => {
  it("um multiplicador individual maior vira a chance de ganho de um 'quase' pra um 'sim'", () => {
    // idade 20 → ageFactor 1.6; chance base = 0.02*1.6 = 0.032 (speedMultiplier=1).
    // rng fixo em 0.05: sem mentor (mult=1) fica ACIMA da chance (sem ganho);
    // com mentor (mult=2, chance=0.064) fica ABAIXO (ganha).
    const fixedRng = () => 0.05;
    const p = player({ id: "mentee", age: 20 });

    const withoutMentor = applyTraining([p], () => "attack", "2026-01-04", 1, 1, fixedRng, () => 1);
    expect(withoutMentor).toHaveLength(0);

    const withMentor = applyTraining([p], () => "attack", "2026-01-04", 1, 1, fixedRng, () => 2);
    expect(withMentor.length).toBeGreaterThan(0);
    expect(Object.keys(withMentor[0].attrDeltas).length).toBeGreaterThan(0);
  });

  it("sem individualMultiplier informado, o comportamento é idêntico ao de antes (default neutro)", () => {
    const fixedRng = () => 0.05;
    const p = player({ id: "no-mentor", age: 20 });
    const withDefault = applyTraining([p], () => "attack", "2026-01-04", 1, 1, fixedRng);
    const withExplicitNeutral = applyTraining([p], () => "attack", "2026-01-04", 1, 1, fixedRng, () => 1);
    expect(withDefault).toEqual(withExplicitNeutral);
  });
});

describe("applyTraining — dias de treino de verdade evoluem atributo", () => {
  it("um jogador jovem com rng favorável ganha pelo menos um atributo do foco em vários dias de treino", () => {
    // 0.01 fica ACIMA de qualquer risco de lesão configurado (no máximo
    // 0.006) mas ABAIXO da chance de ganho de atributo (~0.096 nesse
    // cenário) — favorável pro treino, sem disparar lesão por acidente.
    const favorableNoInjury = () => 0.01;
    const p = player({ id: "trainee", age: 18, attributes: makeAttributes({}, 10) });
    const patches = applyTraining([p], () => "attack", "2026-01-04", 5, 3, favorableNoInjury);
    expect(patches).toHaveLength(1);
    expect(Object.keys(patches[0].attrDeltas).length).toBeGreaterThan(0);
    // "attack" só mexe nos atributos do próprio foco (finishing/dribbling/off_the_ball/composure/technique).
    for (const attr of Object.keys(patches[0].attrDeltas)) {
      expect(["finishing", "dribbling", "off_the_ball", "composure", "technique"]).toContain(attr);
    }
  });

  it("jogador já lesionado no início da janela não treina nem gera novo risco", () => {
    const alwaysSucceed = () => 0;
    const p = player({ id: "hurt", injured_until: "2026-01-10" });
    const patches = applyTraining([p], () => "attack", "2026-01-04", 7, 5, alwaysSucceed);
    expect(patches).toHaveLength(0);
  });

  it("goleiro treinando foco fora de goleiro pode se machucar mas nunca ganha atributo de ataque", () => {
    // 1ª chamada (roll de lesão) sempre "acerta" (abaixo do risco) -> gera lesão
    // e para a janela ali (break), então NUNCA chega a rolar atributo.
    const p = player({ id: "gk", position: "GK" });
    const patches = applyTraining([p], () => "attack", "2026-01-04", 5, 5, () => 0);
    expect(patches).toHaveLength(1);
    expect(patches[0].injury).toBeDefined();
    expect(Object.keys(patches[0].attrDeltas)).toHaveLength(0);
  });
});

describe("applyTraining — determinístico (mesma seed, mesmo resultado)", () => {
  function seededRng(seed: number) {
    let t = seed;
    return () => {
      t = (t * 9301 + 49297) % 233280;
      return t / 233280;
    };
  }

  it("uma grade semanal com o MESMO foco em todo dia dá o mesmo resultado em duas rodadas com a mesma seed", () => {
    const flatFocus = () => "physical" as const;
    const p1 = player({ id: "a", age: 22 });
    const p2 = player({ id: "b", age: 22 });
    const patchesA = applyTraining([p1], flatFocus, "2026-01-04", 10, 2, seededRng(42));
    const patchesB = applyTraining([p2], flatFocus, "2026-01-04", 10, 2, seededRng(42));
    expect(patchesA.map((p) => ({ ...p, id: undefined })))
      .toEqual(patchesB.map((p) => ({ ...p, id: undefined })));
  });
});

describe("REST_DAY_REGEN_BONUS", () => {
  it("é um número positivo (bônus de verdade, não decorativo)", () => {
    expect(REST_DAY_REGEN_BONUS).toBeGreaterThan(0);
  });
});
