import { describe, expect, it } from "vitest";
import { competitionDayForDate } from "./CompetitionSchedule";

describe("competitionDayForDate", () => {
  it("uses the Japan-local calendar day at the UTC boundary", () => {
    expect(competitionDayForDate(new Date("2026-08-28T14:59:59.999Z"))).toBe("2026-08-28");
    expect(competitionDayForDate(new Date("2026-08-28T15:00:00.000Z"))).toBe("2026-08-29");
  });
});
