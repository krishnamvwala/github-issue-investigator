/** Executable synthetic regression: expiry is in epoch seconds, clock is milliseconds. */
export function originalIsExpired(expiresAtSeconds: number, nowMs: number): boolean {
  return expiresAtSeconds <= Math.floor(nowMs / 1000);
}
export function regressedIsExpired(expiresAtSeconds: number, nowMs: number): boolean {
  return expiresAtSeconds <= nowMs;
}
export function reproduce() {
  const expiresAtSeconds = 1791802800;
  const nowMs = 1791799320000;
  return { expiresAtSeconds, nowMs, originalExpired: originalIsExpired(expiresAtSeconds, nowMs), regressedExpired: regressedIsExpired(expiresAtSeconds, nowMs) };
}
