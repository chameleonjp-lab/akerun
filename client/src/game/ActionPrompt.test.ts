import { describe, expect, it } from "vitest";
import { getActionPrompt } from "./ActionPrompt";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  phase: "dial",
  activeWheel: 2,
  activeDirection: "cw" as const,
  activeTarget: 18,
  currentPass: 1,
  requiredPasses: 2,
  targetStopPending: false,
  protocolInstruction: "輪 3：右回りで 18 に止める",
  opened: false,
  status: "active" as const,
  stage: 2,
  stageCount: 4,
  ...overrides,
});

describe("getActionPrompt", () => {
  it("keeps the exact target available in guided display mode", () => {
    const prompt = getActionPrompt(snapshot());

    expect(prompt.title).toBe("ダイヤルを回す");
    expect(prompt.details).toEqual(["輪 3", "右回り", "目標 18", "1/2回目"]);
    expect(prompt.instruction).toContain("18");
  });

  it("does not invent a hidden target for standard play", () => {
    const prompt = getActionPrompt(
      snapshot({
        activeTarget: null,
        protocolInstruction: "輪 3へフライを拾わせる。右回りで接触痕を探る",
      })
    );

    expect(prompt.details).toEqual(["輪 3", "右回り", "1/2回目", "反応で探す"]);
    expect(prompt.details.join(" ")).not.toContain("目標");
  });

  it("uses a non-leaking message for blind play", () => {
    const prompt = getActionPrompt(
      snapshot({
        activeWheel: null,
        activeDirection: null,
        activeTarget: null,
        currentPass: null,
        requiredPasses: null,
        protocolInstruction:
          "ブラインドモード：音と振動の合図を聞いて操作します。",
      })
    );

    expect(prompt.details).toEqual(["反応で探す"]);
    expect(prompt.instruction).toContain("音と振動");
    expect(prompt.instruction).not.toMatch(/右|左|目標|輪/);
  });

  it("switches to the physical action after the dial stages", () => {
    const prompt = getActionPrompt(
      snapshot({
        phase: "tension-test",
        activeWheel: null,
        activeDirection: null,
        activeTarget: null,
        currentPass: null,
        requiredPasses: null,
        protocolInstruction: "抵抗針が沈む帯域で力を保つ",
        stage: 4,
      })
    );

    expect(prompt.title).toBe("抵抗帯で保持する");
    expect(prompt.details).toEqual(["抵抗針が沈む帯域で保持", "段階 4/4"]);
  });
});
