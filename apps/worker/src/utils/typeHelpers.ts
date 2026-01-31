/**
 * Type Helper Utilities
 *
 * Helpers for strict TypeScript mode (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
 */

/**
 * Assert that a value is defined (not null or undefined).
 * Throws an error if the value is null or undefined.
 *
 * @example
 * const item = items[idx];
 * assertDefined(item, `Missing item at index ${idx}`);
 * item.doSomething(); // Now typed as non-null
 */
export function assertDefined<T>(
  value: T,
  message = 'Expected value to be defined'
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

/**
 * Remove undefined values from an object.
 * Useful for building payloads where optional properties should be omitted rather than set to undefined.
 *
 * @example
 * const payload = omitUndefined({
 *   name: user.name,
 *   reason: maybeReason,      // Will be omitted if undefined
 *   details: maybeDetails,    // Will be omitted if undefined
 * });
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Type guard to check if a value is defined (not null or undefined).
 *
 * @example
 * const items = [1, undefined, 2, null, 3];
 * const defined = items.filter(isDefined); // [1, 2, 3]
 */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

/**
 * Get a value from an array at a specific index, or return a default value.
 * Safer alternative to direct index access with noUncheckedIndexedAccess.
 *
 * @example
 * const first = getOrDefault(items, 0, defaultItem);
 */
export function getOrDefault<T>(arr: T[], index: number, defaultValue: T): T {
  const value = arr[index];
  return value !== undefined ? value : defaultValue;
}

/**
 * Get a value from a Record, with explicit handling of missing keys.
 *
 * @example
 * const value = getFromRecord(record, key);
 * if (value === undefined) {
 *   // handle missing key
 * }
 */
export function getFromRecord<K extends string | number | symbol, V>(
  record: Record<K, V>,
  key: K
): V | undefined {
  return key in record ? record[key] : undefined;
}
