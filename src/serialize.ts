import { parse, stringify } from 'zipson/lib';

// ─── Envelope ────────────────────────────────────────────────────────────────

/**
 * Internal storage envelope that wraps every persisted value.
 *
 * Storing values inside an envelope (rather than as raw JSON) provides three
 * guarantees:
 * 1. **Type-safe round-trips** — primitives like `0`, `false`, and `null` cannot
 *    be confused with "missing data" after a JSON parse.
 * 2. **Co-located TTL** — the expiry timestamp travels with the value in a single
 *    storage key; no extra key is needed.
 * 3. **Forward compatibility** — new metadata fields can be added to the envelope
 *    in future versions without breaking existing stored entries.
 *
 * @internal
 */
type Envelope = {
  /** The actual stored value. May be any JSON-serializable type. */
  v: unknown;
  /**
   * Optional Unix timestamp (milliseconds since epoch) after which the entry is
   * considered expired. Absent means the entry never expires.
   */
  e?: number;
};

/**
 * The result of a successful {@link decodeEntry} call.
 *
 * When `decodeEntry` returns a non-null result, the caller should check `expired`
 * before using `value`. An expired entry should not be surfaced to the user.
 *
 * @example
 * const result = decodeEntry(raw);
 * if (!result || result.expired) return undefined;
 * return result.value;
 */
export type DecodeResult = {
  /** The decoded value extracted from the envelope. */
  value: unknown;
  /**
   * `true` when the entry's TTL has elapsed and the value should not be used.
   * `false` when the entry is still valid (or has no TTL).
   */
  expired: boolean;
};

// ─── Encode / Decode ─────────────────────────────────────────────────────────

/**
 * Serialize a value into a storage-ready string by wrapping it in an envelope.
 *
 * Always returns a string, so the result can be passed directly to
 * `storage.setItem()` without any additional conversion.
 *
 * When `opts.compress` is `true`, the envelope is serialized with zipson's
 * `stringify` instead of `JSON.stringify`. Zipson produces a shorter binary-safe
 * string that is typically 30–70% smaller for large objects.
 *
 * When `opts.ttl` is a positive number, an expiry timestamp (`e`) is added to
 * the envelope: `Date.now() + ttl`. A `ttl` of `0` or `undefined` means no expiry.
 *
 * @param value - Any JSON-serializable value to store.
 * @param opts  - Optional encoding settings.
 * @param opts.ttl      - Time-to-live in milliseconds. Omit or pass `0` for no expiry.
 * @param opts.compress - When `true`, uses zipson compression instead of JSON.
 *
 * @returns A string suitable for `storage.setItem()`.
 *
 * @example
 * encodeEntry(42);
 * // → '{"v":42}'
 *
 * encodeEntry('hello', { ttl: 5000 });
 * // → '{"v":"hello","e":1718000005000}'
 *
 * encodeEntry({ x: 1 }, { compress: true });
 * // → zipson-compressed string
 *
 * encodeEntry(false);
 * // → '{"v":false}'  (false is preserved, not confused with "missing")
 */
export function encodeEntry(
  value: unknown,
  opts?: { ttl?: number; compress?: boolean }
): string {
  const envelope: Envelope = { v: value };
  if (opts?.ttl !== undefined && opts.ttl > 0) {
    envelope.e = Date.now() + opts.ttl;
  }
  return opts?.compress ? (stringify(envelope) as string) : JSON.stringify(envelope);
}

/**
 * Deserialize a raw storage string back to its envelope contents.
 *
 * Returns `null` (not `undefined`) when the string cannot be decoded, so that
 * callers can distinguish "malformed data" from a valid entry whose value is `undefined`.
 *
 * Handles the following gracefully (all return `null`):
 * - Invalid JSON / invalid zipson data
 * - Valid JSON that is not an envelope object (missing `"v"` key)
 * - `JSON.parse('null')` — the result is `null`, not an envelope
 * - Empty string
 *
 * When the envelope contains an `e` field and `Date.now() > e`, `expired` is
 * set to `true` in the result. The caller is responsible for deleting the entry.
 *
 * @param raw  - The raw string as returned by `storage.getItem()`.
 * @param opts - Optional decoding settings.
 * @param opts.compress - When `true`, uses zipson `parse` instead of `JSON.parse`.
 *                        Must match the flag used when the entry was encoded.
 *
 * @returns A {@link DecodeResult} object, or `null` if the string is not a valid envelope.
 *
 * @example
 * decodeEntry('{"v":42}');
 * // → { value: 42, expired: false }
 *
 * decodeEntry('{"v":"hello","e":1000}'); // timestamp in the past
 * // → { value: 'hello', expired: true }
 *
 * decodeEntry('plain-string');
 * // → null
 *
 * decodeEntry('{"x":1}'); // missing 'v' key — not an envelope
 * // → null
 */
export function decodeEntry(
  raw: string,
  opts?: { compress?: boolean }
): DecodeResult | null {
  try {
    const envelope: unknown = opts?.compress ? parse(raw) : JSON.parse(raw);
    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      !('v' in (envelope as object))
    ) {
      return null;
    }
    const e = (envelope as any).e as number | undefined;
    const expired = e !== undefined && Date.now() > e;
    return { value: (envelope as any).v, expired };
  } catch {
    return null;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Returns `true` for plain `{}` objects created with object literals or
 * `Object.create(null)`.
 *
 * Returns `false` for:
 * - Arrays (`[]`)
 * - Class instances (`new Date()`, `new Map()`, `new Set()`, user-defined classes)
 * - `null`
 * - Primitive values (`string`, `number`, `boolean`, `symbol`, `bigint`)
 * - `undefined`
 *
 * Useful for distinguishing raw data objects from typed class instances before
 * deciding whether to JSON-parse or pass a value through as-is.
 *
 * @param value - Any value to test.
 * @returns `true` if `value` is a plain object, `false` otherwise.
 *
 * @example
 * isPlainObject({})                   // → true
 * isPlainObject({ a: 1, b: 'two' })   // → true
 * isPlainObject(Object.create(null))  // → true  (null-prototype object)
 *
 * isPlainObject([])                   // → false
 * isPlainObject(new Date())           // → false
 * isPlainObject(new Map())            // → false
 * isPlainObject(null)                 // → false
 * isPlainObject(42)                   // → false
 * isPlainObject('hello')              // → false
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Returns `true` when `value` is a string whose top-level parsed structure is
 * a JSON object (`{}`) or a JSON array (`[]`).
 *
 * Returns `false` for:
 * - Non-string values (numbers, booleans, `null`, `undefined`, objects)
 * - Strings that do not start with `{` or `[`
 * - Strings that start with `{` / `[` but are not valid JSON
 * - Strings representing JSON primitives: `'"hello"'`, `'42'`, `'true'`, `'null'`
 *
 * This is a lightweight guard used internally to decide whether a stored string
 * should be JSON-parsed before further processing.
 *
 * @param value - Any value to test.
 * @returns `true` if `value` is a JSON object/array string, `false` otherwise.
 *
 * @example
 * isJsonString('{"a":1}')       // → true
 * isJsonString('[1,2,3]')       // → true
 * isJsonString('{"a":{"b":2}}') // → true  (nested objects)
 *
 * isJsonString('hello')         // → false
 * isJsonString('42')            // → false  (valid JSON, but not object/array)
 * isJsonString('true')          // → false
 * isJsonString('null')          // → false
 * isJsonString(42)              // → false  (not a string)
 * isJsonString(null)            // → false
 * isJsonString('{broken')       // → false  (invalid JSON)
 * isJsonString('')              // → false
 */
export function isJsonString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.charAt(0) !== '{' && t.charAt(0) !== '[') return false;
  try {
    const parsed = JSON.parse(t);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}
