export const START_COUNTDOWN_SECONDS = 3;

export function getStartCountdownSteps(
  seconds = START_COUNTDOWN_SECONDS
): number[] {
  const safeSeconds = Math.max(
    1,
    Math.floor(Number.isFinite(seconds) ? seconds : START_COUNTDOWN_SECONDS)
  );
  return Array.from({ length: safeSeconds }, (_, index) => safeSeconds - index);
}

export function shouldAbortStartCountdown(
  countdownReady: boolean,
  interrupted: boolean,
  documentHidden: boolean
): boolean {
  return !countdownReady || interrupted || documentHidden;
}
