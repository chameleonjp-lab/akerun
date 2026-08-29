const TOKYO_TIME_ZONE = "Asia/Tokyo";

export const competitionDayForDate = (date = new Date()) => {
  if (!Number.isFinite(date.getTime())) throw new Error("invalid competition date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (!values.year || !values.month || !values.day) {
    throw new Error("competition date formatting failed");
  }
  return values.year + "-" + values.month + "-" + values.day;
};
