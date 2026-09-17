import { describe, expect, it } from "vitest";
import {
  mentorStrength, isMentorCandidate, isMenteeCandidate, bestMentorFor, mentoringSpeedMultiplier,
  MENTOR_MIN_AGE, MENTEE_MAX_AGE, MENTOR_MIN_MENTAL,
} from "../mentoring";

function mkPlayer(id: string, age: number, leadership: number, determination: number, overall = 75) {
  return { id, age, attributes: { leadership, determination }, overall };
}

describe("mentorStrength", () => {
  it("é a média de liderança e determinação", () => {
    expect(mentorStrength(mkPlayer("p", 30, 16, 14))).toBe(15);
  });
});

describe("isMentorCandidate", () => {
  it("exige idade mínima E força mental mínima", () => {
    expect(isMentorCandidate(mkPlayer("p", MENTOR_MIN_AGE, MENTOR_MIN_MENTAL, MENTOR_MIN_MENTAL))).toBe(true);
    expect(isMentorCandidate(mkPlayer("p", MENTOR_MIN_AGE - 1, 20, 20))).toBe(false); // jovem demais, mesmo com mental alto
    expect(isMentorCandidate(mkPlayer("p", 35, 8, 8))).toBe(false); // veterano mas sem liderança
  });
});

describe("isMenteeCandidate", () => {
  it("só jovens até o teto de idade", () => {
    expect(isMenteeCandidate(MENTEE_MAX_AGE)).toBe(true);
    expect(isMenteeCandidate(MENTEE_MAX_AGE + 1)).toBe(false);
  });
});

describe("bestMentorFor", () => {
  it("devolve null sem nenhum mentor qualificado no elenco", () => {
    const squad = [mkPlayer("young", 19, 10, 10), mkPlayer("old-fraco", 32, 6, 6)];
    expect(bestMentorFor("young", squad)).toBeNull();
  });

  it("escolhe o mentor mais forte (mental × overall), nunca soma vários", () => {
    const weak = mkPlayer("weak-mentor", 30, 14, 14, 60);
    const strong = mkPlayer("strong-mentor", 34, 19, 18, 92);
    const squad = [mkPlayer("young", 18, 10, 10), weak, strong];
    expect(bestMentorFor("young", squad)?.id).toBe("strong-mentor");
  });

  it("nunca escolhe o próprio jogador como mentor de si mesmo", () => {
    const onlyCandidate = mkPlayer("self", 30, 18, 18, 90);
    expect(bestMentorFor("self", [onlyCandidate])).toBeNull();
  });
});

describe("mentoringSpeedMultiplier", () => {
  it("é neutro (1x) sem mentor", () => {
    expect(mentoringSpeedMultiplier(null)).toBe(1);
  });

  it("cresce com a força do mentor, nunca passa de 1.35x no teto", () => {
    const eliteMentor = mkPlayer("elite", 34, 20, 20, 99);
    const mult = mentoringSpeedMultiplier(eliteMentor);
    expect(mult).toBeGreaterThan(1);
    expect(mult).toBeLessThanOrEqual(1.35);
  });

  it("mentor fraco (no limiar mínimo) rende bônus pequeno", () => {
    const barelyQualifies = mkPlayer("barely", MENTOR_MIN_AGE, MENTOR_MIN_MENTAL, MENTOR_MIN_MENTAL, 60);
    const eliteMentor = mkPlayer("elite", 34, 20, 20, 99);
    expect(mentoringSpeedMultiplier(barelyQualifies)).toBeLessThan(mentoringSpeedMultiplier(eliteMentor));
    expect(mentoringSpeedMultiplier(barelyQualifies)).toBeGreaterThan(1);
  });
});
