import { describe, expect, it } from "vitest";
import { firedSeasonByClub, isFiringSeason } from "../career";

describe("firedSeasonByClub / isFiringSeason — item 14 do backlog FootSim", () => {
  it("marca a temporada mais recente de um clube de onde o técnico foi demitido", () => {
    const rows = [
      { club_id: "a", season: 2023 },
      { club_id: "a", season: 2024 },
      { club_id: "b", season: 2025 },
    ];
    const map = firedSeasonByClub(rows, new Set(["a"]));
    expect(isFiringSeason(rows[0], map)).toBe(false); // 2023 não é a última temporada no clube a
    expect(isFiringSeason(rows[1], map)).toBe(true);  // 2024 é a última temporada no clube a — aqui foi a demissão
    expect(isFiringSeason(rows[2], map)).toBe(false); // clube b nunca demitiu
  });

  it("não marca nada quando nenhum clube da trajetória está em fired_from_club_ids", () => {
    const rows = [{ club_id: "a", season: 2023 }, { club_id: "b", season: 2024 }];
    const map = firedSeasonByClub(rows, new Set());
    expect(isFiringSeason(rows[0], map)).toBe(false);
    expect(isFiringSeason(rows[1], map)).toBe(false);
  });

  it("suporta múltiplos clubes demitidos ao longo da carreira, cada um com sua última temporada", () => {
    const rows = [
      { club_id: "a", season: 2022 }, { club_id: "a", season: 2023 },
      { club_id: "b", season: 2024 },
      { club_id: "c", season: 2025 }, { club_id: "c", season: 2026 },
    ];
    const map = firedSeasonByClub(rows, new Set(["a", "c"]));
    expect(isFiringSeason(rows[1], map)).toBe(true);  // última no clube a
    expect(isFiringSeason(rows[0], map)).toBe(false);
    expect(isFiringSeason(rows[2], map)).toBe(false); // clube b não está em fired_from_club_ids
    expect(isFiringSeason(rows[4], map)).toBe(true);  // última no clube c
    expect(isFiringSeason(rows[3], map)).toBe(false);
  });

  it("lida com club_id nulo sem quebrar", () => {
    const rows = [{ club_id: null, season: 2025 }];
    const map = firedSeasonByClub(rows, new Set(["a"]));
    expect(isFiringSeason(rows[0], map)).toBe(false);
  });
});
