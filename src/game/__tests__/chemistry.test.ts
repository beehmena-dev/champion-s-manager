import { describe, expect, it } from "vitest";
import { rateTacticalTeam, squadChemistryMultiplier } from "../tactics";
import { makeClub, makeXI } from "./fixtures";

describe("squadChemistryMultiplier", () => {
  it("é neutro (1) sem todayISO — display sem data disponível não penaliza nem bonifica", () => {
    expect(squadChemistryMultiplier([{ club_since: "2020-01-01" }], undefined)).toBe(1);
  });

  it("é neutro (1) pra elenco vazio", () => {
    expect(squadChemistryMultiplier([], "2026-01-01")).toBe(1);
  });

  it("trata club_since ausente (seed importado) como 1 ano — neutro, sem penalidade", () => {
    const m = squadChemistryMultiplier([{ club_since: null }, { club_since: undefined }], "2026-01-01");
    expect(m).toBeCloseTo(1, 5);
  });

  it("penaliza levemente um time recém-montado (chegou hoje)", () => {
    const m = squadChemistryMultiplier(
      [{ club_since: "2026-01-01" }, { club_since: "2026-01-01" }],
      "2026-01-01",
    );
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThanOrEqual(0.94); // nunca passa do piso
  });

  it("bonifica levemente um elenco que já joga junto há anos", () => {
    const m = squadChemistryMultiplier(
      [{ club_since: "2020-01-01" }, { club_since: "2019-06-01" }],
      "2026-01-01",
    );
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(1.03); // nunca passa do teto
  });

  it("mistura jogadores com e sem club_since sem quebrar (um null no meio não vira NaN)", () => {
    const m = squadChemistryMultiplier(
      [{ club_since: "2026-01-01" }, { club_since: null }, { club_since: "2018-01-01" }],
      "2026-01-01",
    );
    expect(Number.isFinite(m)).toBe(true);
    expect(m).toBeGreaterThanOrEqual(0.94);
    expect(m).toBeLessThanOrEqual(1.03);
  });
});

describe("rateTacticalTeam — integração da química", () => {
  it("expõe chemistry=1 quando todayISO não é passado (compat com chamadas de display antigas)", () => {
    const players = makeXI("h");
    const club = makeClub();
    const rating = rateTacticalTeam(players, club);
    expect(rating.chemistry).toBe(1);
  });

  it("um XI recém-formado rende menos que o mesmo XI com anos de estrada juntos", () => {
    const club = makeClub();
    const today = "2026-01-01";

    const freshXI = makeXI("fresh").map((p) => ({ ...p, club_since: today }));
    const veteranXI = makeXI("vet").map((p) => ({ ...p, club_since: "2019-01-01" }));

    const freshRating = rateTacticalTeam(freshXI, club, undefined, today);
    const veteranRating = rateTacticalTeam(veteranXI, club, undefined, today);

    expect(freshRating.chemistry).toBeLessThan(veteranRating.chemistry);
    expect(freshRating.overall).toBeLessThan(veteranRating.overall);
  });
});
