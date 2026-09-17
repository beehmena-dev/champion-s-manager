import { describe, expect, it } from "vitest";
import { toTacticExport, parseTacticExport, TacticImportError, TACTIC_EXPORT_VERSION, type TacticSnapshotLike } from "../tactic-export";
import { DEFAULT_INSTRUCTIONS } from "../player-instructions";

function makeSnapshot(overrides: Partial<TacticSnapshotLike> = {}): TacticSnapshotLike {
  return {
    formation: "4-3-3", mentality: "attacking", pressing: 4, defensive_line: 4, tempo: 3, passing_style: "short",
    team_fluidity: "fluid",
    lineup: [
      { slot: "GK", playerId: "p1", role: "gk_defend" },
      { slot: "ST", playerId: "p2", role: "af_attack", instructions: { ...DEFAULT_INSTRUCTIONS, shoot: 1 } },
    ],
    ...overrides,
  };
}

describe("toTacticExport — nunca carrega playerId", () => {
  it("serializa os campos táticos e as posições, sem nenhum playerId", () => {
    const exported = toTacticExport(makeSnapshot());
    expect(exported.version).toBe(TACTIC_EXPORT_VERSION);
    expect(exported.formation).toBe("4-3-3");
    expect(exported.team_fluidity).toBe("fluid");
    expect(exported.slots).toHaveLength(2);
    for (const s of exported.slots) {
      expect(s).not.toHaveProperty("playerId");
    }
    expect(exported.slots.find((s) => s.slot === "ST")?.instructions?.shoot).toBe(1);
  });

  it("descarta slot sem função escolhida (nunca escalado)", () => {
    const snap = makeSnapshot({ lineup: [{ slot: "GK", playerId: "p1", role: "gk_defend" }, { slot: "LB", playerId: "", role: "" }] });
    const exported = toTacticExport(snap);
    expect(exported.slots).toHaveLength(1);
  });

  it("fluidez ausente vira 'structured' por padrão", () => {
    const exported = toTacticExport(makeSnapshot({ team_fluidity: undefined }));
    expect(exported.team_fluidity).toBe("structured");
  });
});

describe("parseTacticExport — round-trip", () => {
  it("um export válido volta com os mesmos campos táticos", () => {
    const exported = toTacticExport(makeSnapshot());
    const parsed = parseTacticExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed.formation).toBe("4-3-3");
    expect(parsed.mentality).toBe("attacking");
    expect(parsed.pressing).toBe(4);
    expect(parsed.team_fluidity).toBe("fluid");
    expect(parsed.slots).toHaveLength(2);
    expect(parsed.slots[1].instructions?.shoot).toBe(1);
  });
});

describe("parseTacticExport — rejeita arquivo inválido/malicioso", () => {
  it("rejeita quando não é objeto", () => {
    expect(() => parseTacticExport(null)).toThrow(TacticImportError);
    expect(() => parseTacticExport("texto solto")).toThrow(TacticImportError);
    expect(() => parseTacticExport(42)).toThrow(TacticImportError);
  });

  it("rejeita formação desconhecida (nunca deixa passar um valor de enum bagunçado)", () => {
    expect(() => parseTacticExport({ formation: "7-7-7", mentality: "attacking", slots: [{ slot: "GK", role: "x" }] }))
      .toThrow(/formação/i);
  });

  it("rejeita mentalidade desconhecida", () => {
    expect(() => parseTacticExport({ formation: "4-4-2", mentality: "caotica", slots: [{ slot: "GK", role: "x" }] }))
      .toThrow(/mentalidade/i);
  });

  it("rejeita sem slots ou slots vazio", () => {
    expect(() => parseTacticExport({ formation: "4-4-2", mentality: "balanced" })).toThrow(/posição/i);
    expect(() => parseTacticExport({ formation: "4-4-2", mentality: "balanced", slots: [] })).toThrow(/posição/i);
  });

  it("rejeita item de slots mal formado", () => {
    expect(() => parseTacticExport({ formation: "4-4-2", mentality: "balanced", slots: [{ slot: "GK" }] }))
      .toThrow(/mal formada/i);
    expect(() => parseTacticExport({ formation: "4-4-2", mentality: "balanced", slots: ["não é objeto"] }))
      .toThrow(/mal formada/i);
  });

  it("dials fora de 1-5 (ou ausentes/bagunçados) são recolocados no intervalo em vez de quebrar", () => {
    const parsed = parseTacticExport({
      formation: "4-4-2", mentality: "balanced", pressing: 99, defensive_line: -5, tempo: "abc",
      slots: [{ slot: "GK", role: "gk_defend" }],
    });
    expect(parsed.pressing).toBe(5);
    expect(parsed.defensive_line).toBe(1);
    expect(parsed.tempo).toBe(3); // fallback pro default quando não é número
  });

  it("passing_style/team_fluidity desconhecidos caem pro padrão em vez de quebrar", () => {
    const parsed = parseTacticExport({
      formation: "4-4-2", mentality: "balanced", passing_style: "teleporte", team_fluidity: "gasoso",
      slots: [{ slot: "GK", role: "gk_defend" }],
    });
    expect(parsed.passing_style).toBe("mixed");
    expect(parsed.team_fluidity).toBe("structured");
  });

  it("instruções bagunçadas dentro de um slot nunca quebram o parse (normalizeInstructions absorve)", () => {
    const parsed = parseTacticExport({
      formation: "4-4-2", mentality: "balanced",
      slots: [{ slot: "GK", role: "gk_defend", instructions: { shoot: "muito", lixo: 123 } }],
    });
    expect(parsed.slots[0].instructions?.shoot).toBe(0);
  });
});
