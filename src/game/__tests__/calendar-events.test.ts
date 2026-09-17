import { describe, it, expect } from "vitest";
import { buildCalendarEventMap } from "../calendar-events";

const MY_CLUB = "club-mine";

describe("buildCalendarEventMap", () => {
  it("um jogo em casa não jogado vira evento tom 'info' no dia certo", () => {
    const map = buildCalendarEventMap({
      myClubId: MY_CLUB,
      matches: [{ match_date: "2026-03-10", played: false, home_score: null, away_score: null, home_club_id: MY_CLUB, away_club_id: "rival", away_name: "Rival FC" }],
      contracts: [], inbox: [],
    });
    const evs = map.get("2026-03-10");
    expect(evs).toHaveLength(1);
    expect(evs![0].kind).toBe("match");
    expect(evs![0].tone).toBe("info");
    expect(evs![0].label).toContain("Rival FC");
  });

  it("vitória em casa vira tom 'ok'; derrota fora vira tom 'danger'", () => {
    const map = buildCalendarEventMap({
      myClubId: MY_CLUB,
      matches: [
        { match_date: "2026-03-10", played: true, home_score: 3, away_score: 1, home_club_id: MY_CLUB, away_club_id: "rival", home_name: "Meu Clube", away_name: "Rival" },
        { match_date: "2026-03-17", played: true, home_score: 2, away_score: 0, home_club_id: "rival2", away_club_id: MY_CLUB, home_name: "Rival2", away_name: "Meu Clube" },
      ],
      contracts: [], inbox: [],
    });
    expect(map.get("2026-03-10")![0].tone).toBe("ok");
    expect(map.get("2026-03-17")![0].tone).toBe("danger");
  });

  it("fim de contrato de jogador vira evento tom 'warn' no dia exato", () => {
    const map = buildCalendarEventMap({
      myClubId: MY_CLUB, matches: [],
      contracts: [{ contract_until: "2026-06-30", name: "Fulano" }],
      inbox: [],
    });
    const evs = map.get("2026-06-30");
    expect(evs).toHaveLength(1);
    expect(evs![0].kind).toBe("contract_end");
    expect(evs![0].label).toContain("Fulano");
  });

  it("mensagens da caixa de entrada: médico/transferência/base viram evento; resultado/diretoria/imprensa/geral são ignoradas (já cobertas por outra fonte ou sem valor de calendário)", () => {
    const map = buildCalendarEventMap({
      myClubId: MY_CLUB, matches: [], contracts: [],
      inbox: [
        { game_date: "2026-04-01", category: "medical", subject: "Lesão de Fulano" },
        { game_date: "2026-04-02", category: "transfer", subject: "Proposta recebida" },
        { game_date: "2026-04-03", category: "youth", subject: "Promovido da base" },
        { game_date: "2026-04-04", category: "result", subject: "Resultado da rodada" },
        { game_date: "2026-04-05", category: "board", subject: "Recado da diretoria" },
        { game_date: "2026-04-06", category: "press", subject: "Coletiva" },
        { game_date: "2026-04-07", category: "general", subject: "Aviso geral" },
      ],
    });
    expect(map.get("2026-04-01")?.[0].kind).toBe("medical");
    expect(map.get("2026-04-02")?.[0].kind).toBe("transfer");
    expect(map.get("2026-04-03")?.[0].kind).toBe("youth");
    expect(map.get("2026-04-04")).toBeUndefined();
    expect(map.get("2026-04-05")).toBeUndefined();
    expect(map.get("2026-04-06")).toBeUndefined();
    expect(map.get("2026-04-07")).toBeUndefined();
  });

  it("múltiplos eventos no mesmo dia se acumulam na mesma entrada do mapa", () => {
    const map = buildCalendarEventMap({
      myClubId: MY_CLUB,
      matches: [{ match_date: "2026-05-05", played: false, home_score: null, away_score: null, home_club_id: MY_CLUB, away_club_id: "rival", away_name: "Rival" }],
      contracts: [{ contract_until: "2026-05-05", name: "Fulano" }],
      inbox: [{ game_date: "2026-05-05", category: "medical", subject: "Lesão de Beltrano" }],
    });
    expect(map.get("2026-05-05")).toHaveLength(3);
  });

  it("dias sem nenhum evento não entram no mapa", () => {
    const map = buildCalendarEventMap({ myClubId: MY_CLUB, matches: [], contracts: [], inbox: [] });
    expect(map.size).toBe(0);
  });
});
