import { describe, it, expect } from "vitest";
import { ALL_ROLES, rolesForPosition, resolveRole, defaultRoleForPosition } from "../roles";
import { GRANULAR_POSITIONS } from "../types";

// Trava de regressão do pedido explícito do user (2026-09-11): "um atacante
// não pode ser um zagueiro construtor ou um volante". Ver f7-realroles na
// memória do projeto — esse é o teste automatizado que aquele trabalho nunca
// teve (foi só verificado ao vivo no navegador).
const ATTACK_ONLY_FAMILIES = ["af", "poacher", "cf", "tm", "dlf", "f9", "pf"]; // centroavante
const DEFENSE_ONLY_FAMILIES = ["cd", "sp", "bpd", "libero"]; // zagueiro

describe("rolesForPosition — travas de posição", () => {
  it("centroavante (CA) nunca oferece função de zagueiro ou volante", () => {
    const legal = rolesForPosition("CA");
    for (const role of legal) {
      expect(DEFENSE_ONLY_FAMILIES).not.toContain(role.familyKey);
      expect(role.familyKey).not.toBe("dm"); // volante
    }
  });

  it("zagueiro (ZAG) nunca oferece função de centroavante ou ponta", () => {
    const legal = rolesForPosition("ZAG");
    for (const role of legal) {
      expect(ATTACK_ONLY_FAMILIES).not.toContain(role.familyKey);
      expect(role.familyKey).not.toBe("winger");
    }
  });

  it("toda posição granular tem pelo menos 1 função legal", () => {
    for (const pos of GRANULAR_POSITIONS) {
      expect(rolesForPosition(pos).length).toBeGreaterThan(0);
    }
  });

  it("toda função em ALL_ROLES só lista posições onde ela mesma aparece em rolesForPosition (consistência circular)", () => {
    for (const role of ALL_ROLES) {
      for (const pos of role.positions) {
        expect(rolesForPosition(pos).map((r) => r.key)).toContain(role.key);
      }
    }
  });
});

describe("resolveRole — nunca quebra em dado velho/inválido", () => {
  it("chave de função antiga (pré-reforma) cai no padrão da posição em vez de lançar erro", () => {
    const resolved = resolveRole("sweeper_keeper", "GOL");
    expect(resolved.key).toBe(defaultRoleForPosition("GOL").key);
  });

  it("chave de função legal em OUTRA posição cai no padrão em vez de vazar pra posição errada", () => {
    // "poacher_attack" só é legal em CA — pedir pra ZAG deve cair no padrão de ZAG, não travar/quebrar.
    const resolved = resolveRole("poacher_attack", "ZAG");
    expect(resolved.positions).toContain("ZAG");
  });

  it("null/undefined sempre devolve uma função válida", () => {
    expect(resolveRole(null, "CA").positions).toContain("CA");
    expect(resolveRole(undefined, "MEI").positions).toContain("MEI");
  });
});
