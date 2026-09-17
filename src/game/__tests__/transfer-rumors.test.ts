import { describe, expect, it } from "vitest";
import { isNotableTransfer, plausibleSuitor, pickRumorTarget, type RumorSuitor, type RumorTarget } from "../transfer-rumors";

describe("isNotableTransfer — item 19 do backlog FootSim", () => {
  it("jogador de overall alto é notícia mesmo com taxa baixa", () => {
    expect(isNotableTransfer(80, 1_000_000)).toBe(true);
  });
  it("taxa alta é notícia mesmo com overall mediano", () => {
    expect(isNotableTransfer(65, 20_000_000)).toBe(true);
  });
  it("jogador mediano com taxa baixa não é notícia", () => {
    expect(isNotableTransfer(65, 2_000_000)).toBe(false);
  });
});

describe("plausibleSuitor — item 19 do backlog FootSim", () => {
  const clubs: RumorSuitor[] = [
    { id: "rico", name: "Clube Rico", reputation: 80, transfer_budget: 50_000_000 },
    { id: "pobre", name: "Clube Pobre", reputation: 75, transfer_budget: 1_000_000 },
    { id: "fraco", name: "Clube Fraco", reputation: 30, transfer_budget: 50_000_000 },
  ];

  it("só considera clube com orçamento plausível pro valor do jogador", () => {
    const suitor = plausibleSuitor(clubs, 20_000_000, 70, () => 0);
    expect(suitor?.id).not.toBe("pobre");
  });

  it("só considera clube com reputação próxima ou maior que a do usuário", () => {
    const onlyStrong = clubs.filter((c) => c.id !== "pobre");
    // fraco tem orçamento ok mas reputação muito abaixo — não deve ser escolhido
    for (let i = 0; i < 20; i++) {
      const suitor = plausibleSuitor(onlyStrong, 20_000_000, 70, () => i / 20);
      expect(suitor?.id).not.toBe("fraco");
    }
  });

  it("sem nenhum clube plausível, retorna null", () => {
    const suitor = plausibleSuitor(clubs, 200_000_000, 90, Math.random);
    expect(suitor).toBeNull();
  });

  it("lista vazia retorna null", () => {
    expect(plausibleSuitor([], 10_000_000, 60, Math.random)).toBeNull();
  });
});

describe("pickRumorTarget — item 19 do backlog FootSim", () => {
  const players: RumorTarget[] = [
    { id: "estrela", name: "Estrela", market_value: 80_000_000 },
    { id: "titular", name: "Titular", market_value: 20_000_000 },
    { id: "reserva1", name: "Reserva 1", market_value: 2_000_000 },
    { id: "reserva2", name: "Reserva 2", market_value: 1_500_000 },
    { id: "reserva3", name: "Reserva 3", market_value: 1_000_000 },
    { id: "reserva4", name: "Reserva 4", market_value: 500_000 },
    { id: "reserva5", name: "Reserva 5", market_value: 400_000 },
  ];

  it("nunca sorteia fora do topo 5 por valor de mercado", () => {
    for (let i = 0; i < 20; i++) {
      const target = pickRumorTarget(players, () => i / 20);
      expect(["estrela", "titular", "reserva1", "reserva2", "reserva3"]).toContain(target?.id);
    }
  });

  it("elenco vazio retorna null", () => {
    expect(pickRumorTarget([], Math.random)).toBeNull();
  });
});
