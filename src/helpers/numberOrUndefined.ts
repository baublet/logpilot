export function numberOrUndefined(subject: unknown): number | undefined {
  if (
    typeof subject === "number" &&
    !Number.isNaN(subject) &&
    Number.isFinite(subject)
  ) {
    return subject;
  }
  if (subject === "string") {
    const parsed = parseInt(subject, 10);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}