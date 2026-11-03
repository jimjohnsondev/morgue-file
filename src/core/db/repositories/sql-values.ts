// Converts SQLite's NULL to undefined, so nothing outside the repositories sees null (STYLE.md).

/** Returns undefined for a NULL column. */
export function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}
