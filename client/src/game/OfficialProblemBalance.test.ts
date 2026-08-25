import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditOfficialProblemCatalog,
  OFFICIAL_PROBLEM_AUDIT,
  OFFICIAL_PROBLEM_BALANCE,
  renderOfficialProblemBalanceMarkdown,
} from "./OfficialProblemBalance";

describe("official problem balance audit", () => {
  it("audits every official problem through the complete unlock path", () => {
    expect(OFFICIAL_PROBLEM_AUDIT.valid).toBe(true);
    expect(OFFICIAL_PROBLEM_AUDIT.problems).toHaveLength(20);
    expect(OFFICIAL_PROBLEM_AUDIT.outlierProblemIds).toEqual([]);

    OFFICIAL_PROBLEM_AUDIT.problems.forEach(problem => {
      expect(problem.dialSolved).toBe(true);
      expect(problem.fullyUnlockable).toBe(true);
      expect(problem.regularGateOverlapCount).toBe(0);
      expect(problem.falseGateDuplicateCount).toBe(0);
      expect(problem.invalidDirectionCount).toBe(0);
      expect(problem.invalidPassCount).toBe(0);
      expect(problem.invalidStageWheelCount).toBe(0);
      expect(problem.invalidPositionCount).toBe(0);
      expect(problem.issueCodes).toEqual([]);
    });
  });

  it("detects a manually introduced extreme par-time outlier", () => {
    const modified = OFFICIAL_PROBLEM_BALANCE.map((balance, index) =>
      index === 0 ? { ...balance, parTime: 1 } : balance
    );

    const audit = auditOfficialProblemCatalog(modified);
    expect(audit.valid).toBe(false);
    expect(audit.outlierProblemIds).toContain("AKERUN-01-V1");
    expect(
      audit.problems.find(problem => problem.problemId === "AKERUN-01-V1")
        ?.issueCodes
    ).toContain("EXTREME_BALANCE_OUTLIER");
  });

  it("keeps the checked-in balance table generated from code", () => {
    const document = readFileSync(
      new URL("../../../docs/official-problem-balance.md", import.meta.url),
      "utf8"
    );
    expect(document).toBe(renderOfficialProblemBalanceMarkdown());
  });
});
