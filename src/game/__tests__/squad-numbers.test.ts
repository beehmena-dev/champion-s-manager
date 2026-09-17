import { describe, expect, it } from "vitest";
import { nextSquadNumber, assignSquadNumbers, suggestNumberUpgrades } from "../squad-numbers";

describe("nextSquadNumber", () => {
  it("pega o topo da pilha de preferência do setor quando está livre", () => {
    expect(nextSquadNumber([], "FWD")).toBe(9);
    expect(nextSquadNumber([], "GK")).toBe(1);
  });
  it("pula pro próximo da pilha quando o preferido já está em uso", () => {
    expect(nextSquadNumber([9], "FWD")).toBe(10);
  });
  it("cai no menor número livre quando a pilha inteira do setor já está em uso", () => {
    const used = [9, 10, 7, 11, 17, 19, 20, 27, 29, 32, 39, 45];
    expect(nextSquadNumber(used, "FWD")).toBe(1);
  });
});

describe("assignSquadNumbers", () => {
  it("numera um elenco do zero sem repetir número", () => {
    const players = [
      { id: "a", position: "FWD" as const, overall: 90 },
      { id: "b", position: "FWD" as const, overall: 80 },
      { id: "c", position: "GK" as const, overall: 70 },
    ];
    const out = assignSquadNumbers(players);
    const nums = Object.values(out);
    expect(new Set(nums).size).toBe(nums.length);
    expect(out.a).toBe(9); // melhor atacante pega o topo da pilha
    expect(out.c).toBe(1);
  });
});

describe("suggestNumberUpgrades", () => {
  it("não sugere nada quando ninguém tem número mal encaixado", () => {
    const players = [{ id: "a", position: "FWD" as const, squad_number: 9 }];
    expect(suggestNumberUpgrades(players)).toEqual([]);
  });
  it("sugere trocar pro número melhor quando ele fica livre (o atacante \"dono\" do 9 saiu)", () => {
    const players = [
      { id: "a", position: "FWD" as const, squad_number: 27, overall: 80 }, // hoje usa um número baixo na pilha
      { id: "b", position: "DEF" as const, squad_number: 3, overall: 75 },  // já bem encaixado, não deveria mudar
    ];
    const out = suggestNumberUpgrades(players);
    expect(out).toEqual([{ playerId: "a", currentNumber: 27, suggestedNumber: 9 }]);
  });
  it("nunca sugere pra quem já não tem número (contratação sem squad_number ainda)", () => {
    const players = [{ id: "a", position: "FWD" as const, squad_number: null }];
    expect(suggestNumberUpgrades(players)).toEqual([]);
  });
  it("quando dois jogadores do mesmo setor melhorariam com o mesmo número livre, só o melhor encaixe (maior ganho, depois maior overall) recebe a sugestão", () => {
    const players = [
      { id: "a", position: "FWD" as const, squad_number: 45, overall: 70 }, // pior encaixe atual (último da pilha)
      { id: "b", position: "FWD" as const, squad_number: 39, overall: 95 }, // penúltimo da pilha, overall maior
    ];
    const out = suggestNumberUpgrades(players);
    expect(out.length).toBe(1);
    expect(out[0].suggestedNumber).toBe(9);
    expect(out[0].playerId).toBe("a"); // maior ganho de posição na pilha vence, não só overall
  });
  it("não sugere um número que ficaria livre só por causa de OUTRA sugestão da mesma rodada (1 nível só)", () => {
    const players = [
      { id: "a", position: "FWD" as const, squad_number: 27, overall: 80 }, // vai sugerir subir pro 9
      { id: "b", position: "FWD" as const, squad_number: 17, overall: 70 }, // o 27 só ficaria livre se "a" mudasse — não deve encadear
    ];
    const out = suggestNumberUpgrades(players);
    expect(out.find((s) => s.playerId === "b")).toBeUndefined();
  });
});
