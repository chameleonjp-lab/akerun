import { describe, expect, it } from "vitest";
import { AUDIO_SAMPLE_DEFINITIONS } from "./AudioFeedback";

describe("AudioFeedbackの試聴カタログ", () => {
  it("機構の7種類の反応を重複なく説明する", () => {
    expect(AUDIO_SAMPLE_DEFINITIONS).toHaveLength(7);
    expect(new Set(AUDIO_SAMPLE_DEFINITIONS.map((sample) => sample.id)).size).toBe(7);
    expect(AUDIO_SAMPLE_DEFINITIONS.map((sample) => sample.title)).toEqual([
      "空転",
      "ゲート縁",
      "偽ゲート",
      "フライ接続",
      "深い接触",
      "フェンス",
      "ボルト",
    ]);
    AUDIO_SAMPLE_DEFINITIONS.forEach((sample) => {
      expect(sample.description.length).toBeGreaterThan(0);
      expect(sample.visualMeaning.length).toBeGreaterThan(0);
    });
  });
});
