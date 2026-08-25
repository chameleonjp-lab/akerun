import { describe, expect, it } from "vitest";
import { AUDIO_SAMPLE_DEFINITIONS, getFalseGateToneProfile } from "./AudioFeedback";

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

  it("Nocturneの偽ゲート音は正規接触へ近づくが、完全には同一にしない", () => {
    const aurora = getFalseGateToneProfile(0.42, 0.76, 0.18);
    const nocturne = getFalseGateToneProfile(0.42, 0.76, 0.82);
    const deep = { primaryFrequency: 612, secondaryFrequency: 306 };
    const distance = (tone: typeof aurora) =>
      Math.abs(tone.primaryFrequency - deep.primaryFrequency) +
      Math.abs(tone.secondaryFrequency - deep.secondaryFrequency);

    expect(distance(nocturne)).toBeLessThan(distance(aurora));
    expect(nocturne.primaryFrequency).not.toBe(deep.primaryFrequency);
    expect(nocturne.secondaryFrequency).not.toBe(deep.secondaryFrequency);
  });
});
