/**
 * zodCast — standalone Zod-aware type coercion utility.
 *
 * Converts an unknown raw value (typically a string from `localStorage`, a URL
 * parameter, an environment variable, or a form field) into the correct JavaScript
 * type described by a Zod schema.
 *
 * This module has **no dependency on km-storage internals** and can be used in
 * any project that needs to coerce raw inputs into Zod-typed values.
 *
 * Compatible with Zod 4.x (`_def.type` lowercase strings) and Zod 3.x
 * (`_def.typeName` PascalCase strings) — both are handled in each `case` branch.
 *
 * @module zodCast
 */

import type { z } from 'zod';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Read the Zod schema type discriminator string from a schema's internal `_def`.
 *
 * - **Zod 4.x:** `_def.type` is a lowercase string (`'string'`, `'number'`, …)
 * - **Zod 3.x:** `_def.typeName` is a PascalCase string (`'ZodString'`, `'ZodNumber'`, …)
 *
 * Returns an empty string when neither field is present so that `switch` falls
 * through to the `default` case rather than throwing.
 *
 * @param schema - Any Zod schema instance.
 * @returns The type discriminator string, or `''` if unavailable.
 *
 * @internal
 */
function schemaType(schema: z.ZodTypeAny): string {
  return (schema as any)?._def?.type ?? (schema as any)?._def?.typeName ?? '';
}

/**
 * Extract the `innerType` from a wrapper schema (e.g. `ZodOptional`, `ZodNullable`,
 * `ZodDefault`, `ZodCatch`, `ZodReadonly`).
 *
 * Wrapper schemas in Zod store the wrapped schema under `_def.innerType`.
 * Returns `undefined` when no inner type is present (e.g. for primitive schemas).
 *
 * @param schema - A Zod schema that may be a wrapper.
 * @returns The inner `ZodTypeAny` schema, or `undefined`.
 *
 * @internal
 */
function innerType(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  return (schema as any)?._def?.innerType ?? undefined;
}

/**
 * Attempt to parse a string as JSON.
 *
 * Returns `undefined` (not `null`) on failure so that callers can distinguish
 * "parse failed" from a successfully parsed JSON `null`.
 *
 * @param raw - The string to parse.
 * @returns The parsed value, or `undefined` if parsing throws.
 *
 * @internal
 *
 * @example
 * tryParseJson('{"x":1}') // → { x: 1 }
 * tryParseJson('42')      // → 42
 * tryParseJson('broken')  // → undefined
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Coerce an unknown value to a JSON-parsed form when it is a JSON string, or
 * return it as-is when it is not a string.
 *
 * Used for schemas that accept complex types (objects, arrays, intersection,
 * unknown) where a stringified payload may have been stored.
 *
 * @param raw - Any value.
 * @returns The parsed value when `raw` is a valid JSON string, otherwise `raw` itself.
 *
 * @internal
 *
 * @example
 * asJsonComplex('{"a":1}') // → { a: 1 }
 * asJsonComplex(42)        // → 42  (not a string — returned as-is)
 * asJsonComplex('hello')   // → 'hello'  (not valid JSON object/array — returned as-is)
 */
function asJsonComplex(raw: unknown): unknown {
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    return parsed !== undefined ? parsed : raw;
  }
  return raw;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Cast a raw value to the type described by a Zod schema.
 *
 * `zodCast` is a **standalone** coercion utility that has no dependency on the
 * km-storage core. Use it wherever you receive untyped string or unknown data
 * and need to convert it to a typed Zod value:
 * - `localStorage` raw strings
 * - URL search parameters (`URLSearchParams.get('page')`)
 * - Environment variables (`process.env.DEBUG`)
 * - Form field values (`FormData.get('choice')`)
 *
 * ### Coercion rules (by schema type)
 *
 * | Schema type       | Coercion applied                                               |
 * |-------------------|----------------------------------------------------------------|
 * | `z.string()`      | Non-strings are converted with `String(raw)`                   |
 * | `z.number()`      | Strings are converted with `Number(raw)`; `Infinity` → `undefined` |
 * | `z.boolean()`     | Strings `'true'`/`'false'` → `true`/`false`                    |
 * | `z.bigint()`      | Strings are converted with `BigInt(raw)`                       |
 * | `z.date()`        | ISO strings and numeric timestamps are parsed with `new Date()` |
 * | `z.null()`        | String `'null'` → `null`                                       |
 * | `z.literal(n)`    | Numeric/boolean literals matched from their string form        |
 * | `z.enum(…)`       | Numeric enum values matched from their string form             |
 * | `z.object(…)`     | JSON strings are parsed before validation                      |
 * | `z.array(…)`      | JSON strings are parsed before validation                      |
 * | `z.optional(…)`   | Delegates to inner schema; `null` / `undefined` → `undefined`  |
 * | `z.nullable(…)`   | Delegates to inner schema; `null` / `'null'` → `null`          |
 * | `z.default(…)`    | Returns the schema default when `raw` is `null` or `undefined` |
 * | `z.catch(…)`      | Returns the catch value when inner coercion fails              |
 * | `z.transform(…)`  | Coerces via inner schema then runs the transform               |
 *
 * @template T - The Zod schema type to cast to.
 *
 * @param schema - Any Zod schema (`z.string()`, `z.number()`, `z.object(…)`, …).
 * @param raw    - The value to cast. Strings are coerced when a numeric or boolean
 *                 representation makes sense for the target schema.
 *
 * @returns The typed value as `z.infer<T>`, or `undefined` if coercion or validation fails.
 *
 * @example
 * zodCast(z.number(), '42')                              // → 42
 * zodCast(z.boolean(), 'true')                           // → true
 * zodCast(z.boolean(), 'false')                          // → false
 * zodCast(z.string(), 100)                               // → '100'
 * zodCast(z.number(), 'not-a-number')                    // → undefined
 * zodCast(z.object({ x: z.number() }), '{"x":1}')       // → { x: 1 }
 * zodCast(z.array(z.number()), '[1,2,3]')                // → [1, 2, 3]
 * zodCast(z.optional(z.string()), null)                  // → undefined
 * zodCast(z.nullable(z.string()), null)                  // → null
 * zodCast(z.string().default('fallback'), null)          // → 'fallback'
 * zodCast(z.string().transform((s) => s.toUpperCase()), 'hello') // → 'HELLO'
 *
 * @example
 * // URL search parameter
 * const page = zodCast(z.number().min(1).default(1), new URLSearchParams(location.search).get('page'));
 * // '3' → 3   |   null → 1 (default)
 *
 * @example
 * // Environment variable
 * const debug = zodCast(z.boolean(), process.env.DEBUG);
 * // 'true' → true   |   undefined → undefined
 *
 * @example
 * // Form field
 * const sort = zodCast(z.enum(['asc', 'desc']), formData.get('sort'));
 * // 'asc' → 'asc'   |   'invalid' → undefined
 */
export function zodCast<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> | undefined {
  const type = schemaType(schema);

  switch (type) {
    // ── Primitives ────────────────────────────────────────────────────────────

    /**
     * `z.string()` — coerces numbers and booleans to their string representation.
     * `null` and `undefined` return `undefined`.
     *
     * @example
     * zodCast(z.string(), 42)        // → '42'
     * zodCast(z.string(), true)      // → 'true'
     * zodCast(z.string(), 'hello')   // → 'hello'
     * zodCast(z.string(), null)      // → undefined
     */
    case 'string':
    case 'ZodString': {
      if (raw === null || raw === undefined) return undefined;
      const str = typeof raw === 'string' ? raw : String(raw);
      const r = schema.safeParse(str);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.number()` — coerces numeric strings with `Number(raw)`.
     * `Infinity`, `-Infinity`, and `NaN` return `undefined`.
     *
     * @example
     * zodCast(z.number(), '3.14')  // → 3.14
     * zodCast(z.number(), '-7')    // → -7
     * zodCast(z.number(), 'abc')   // → undefined
     * zodCast(z.number(), null)    // → undefined
     */
    case 'number':
    case 'ZodNumber': {
      if (raw === null || raw === undefined) return undefined;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!isFinite(num)) return undefined;
      const r = schema.safeParse(num);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.boolean()` — passes native booleans through; coerces the strings
     * `'true'` and `'false'`. Any other input returns `undefined`.
     *
     * @example
     * zodCast(z.boolean(), true)    // → true
     * zodCast(z.boolean(), 'true')  // → true
     * zodCast(z.boolean(), 'false') // → false
     * zodCast(z.boolean(), 'yes')   // → undefined
     * zodCast(z.boolean(), null)    // → undefined
     */
    case 'boolean':
    case 'ZodBoolean': {
      if (raw === null || raw === undefined) return undefined;
      if (typeof raw === 'boolean') return raw as z.infer<T>;
      if (raw === 'true') return true as z.infer<T>;
      if (raw === 'false') return false as z.infer<T>;
      return undefined;
    }

    /**
     * `z.bigint()` — passes native `bigint` through; converts strings and
     * numbers using `BigInt(String(raw).trim())`.
     *
     * @example
     * zodCast(z.bigint(), 42n)                   // → 42n
     * zodCast(z.bigint(), '9007199254740993')     // → 9007199254740993n
     * zodCast(z.bigint(), 'abc')                  // → undefined
     * zodCast(z.bigint(), null)                   // → undefined
     */
    case 'bigint':
    case 'ZodBigInt': {
      if (raw === null || raw === undefined) return undefined;
      if (typeof raw === 'bigint') return raw as z.infer<T>;
      try {
        const big = BigInt(String(raw).trim());
        const r = schema.safeParse(big);
        return r.success ? r.data : undefined;
      } catch {
        return undefined;
      }
    }

    /**
     * `z.date()` — passes valid `Date` instances through; parses ISO strings and
     * numeric timestamps using `new Date(raw)`. Invalid dates return `undefined`.
     *
     * @example
     * zodCast(z.date(), new Date('2024-01-15'))           // → Date
     * zodCast(z.date(), '2024-01-15T00:00:00.000Z')      // → Date
     * zodCast(z.date(), 1705276800000)                    // → Date
     * zodCast(z.date(), 'not-a-date')                     // → undefined
     * zodCast(z.date(), null)                             // → undefined
     */
    case 'date':
    case 'ZodDate': {
      if (raw === null || raw === undefined) return undefined;
      if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? undefined : (raw as z.infer<T>);
      }
      const d = new Date(typeof raw === 'string' || typeof raw === 'number' ? raw : String(raw));
      if (isNaN(d.getTime())) return undefined;
      const r = schema.safeParse(d);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.null()` — accepts `null` or the string `'null'`.
     * Any other input returns `undefined`.
     *
     * @example
     * zodCast(z.null(), null)    // → null
     * zodCast(z.null(), 'null') // → null
     * zodCast(z.null(), 'hi')  // → undefined
     */
    case 'null':
    case 'ZodNull': {
      if (raw === null || raw === 'null') return null as z.infer<T>;
      return undefined;
    }

    /**
     * `z.undefined()` / `z.void()` — always returns `undefined` regardless of input,
     * because these schemas only accept `undefined`.
     */
    case 'undefined':
    case 'void':
    case 'ZodUndefined':
    case 'ZodVoid': {
      return undefined;
    }

    /**
     * `z.nan()` — accepts `NaN` values or the string `'NaN'`.
     * Any other input (including valid numbers) returns `undefined`.
     *
     * @example
     * zodCast(z.nan(), NaN)   // → NaN
     * zodCast(z.nan(), 'NaN') // → NaN
     * zodCast(z.nan(), 42)    // → undefined
     */
    case 'nan':
    case 'ZodNaN': {
      if (typeof raw === 'number' && isNaN(raw)) return raw as z.infer<T>;
      if (raw === 'NaN') return NaN as z.infer<T>;
      return undefined;
    }

    /**
     * `z.symbol()` — only native `symbol` values pass through.
     * No coercion from strings is attempted, as symbols are not serializable.
     *
     * @example
     * zodCast(z.symbol(), Symbol('s')) // → Symbol('s')
     * zodCast(z.symbol(), 's')         // → undefined
     */
    case 'symbol':
    case 'ZodSymbol': {
      if (typeof raw === 'symbol') return raw as z.infer<T>;
      return undefined;
    }

    // ── Literal ───────────────────────────────────────────────────────────────

    /**
     * `z.literal(value)` — matches exact values and attempts coercion from string
     * for numeric and boolean literals.
     *
     * Handles both Zod 4.x (`_def.values` array) and Zod 3.x (`_def.value` scalar).
     *
     * @example
     * zodCast(z.literal('km'), 'km')    // → 'km'
     * zodCast(z.literal(42), '42')      // → 42
     * zodCast(z.literal(true), 'true')  // → true
     * zodCast(z.literal('km'), 'other') // → undefined
     */
    case 'literal':
    case 'ZodLiteral': {
      const def = (schema as any)._def;
      const expected: unknown = def.values !== undefined ? (def.values as unknown[])[0] : def.value;
      if (raw === expected) return raw as z.infer<T>;
      if (typeof expected === 'number' && Number(raw) === expected) return expected as z.infer<T>;
      if (expected === true && raw === 'true') return true as z.infer<T>;
      if (expected === false && raw === 'false') return false as z.infer<T>;
      return undefined;
    }

    // ── Enum (covers ZodEnum and ZodNativeEnum in Zod v4) ───────────────────

    /**
     * `z.enum(…)` / `z.nativeEnum(…)` — returns the raw value if it matches one
     * of the valid enum values. Also coerces numeric enum members from their string form.
     *
     * Handles Zod 4.x (`_def.entries` object), Zod 3.x array enum (`_def.values`),
     * and Zod 3.x native enum (`_def.values` object).
     *
     * @example
     * const schema = z.enum(['a', 'b', 'c']);
     * zodCast(schema, 'a')  // → 'a'
     * zodCast(schema, 'd')  // → undefined
     *
     * enum Code { Ok = 0, Err = 1 }
     * zodCast(z.nativeEnum(Code), '1') // → 1
     */
    case 'enum':
    case 'ZodEnum':
    case 'ZodNativeEnum': {
      const def = (schema as any)._def;
      let validValues: unknown[];
      if (def.entries && typeof def.entries === 'object') {
        validValues = Object.values(def.entries as Record<string, unknown>);
      } else if (Array.isArray(def.values)) {
        validValues = def.values as unknown[];
      } else if (def.values && typeof def.values === 'object') {
        validValues = Object.values(def.values as Record<string, unknown>);
      } else {
        validValues = [];
      }
      if (validValues.includes(raw)) return raw as z.infer<T>;
      if (typeof raw === 'string') {
        const asNum = Number(raw);
        if (!isNaN(asNum) && validValues.includes(asNum)) return asNum as z.infer<T>;
      }
      return undefined;
    }

    // ── Object / Collection ───────────────────────────────────────────────────

    /**
     * `z.object(…)` — JSON strings are parsed before validation.
     * Arrays and `null` return `undefined`.
     *
     * @example
     * zodCast(z.object({ x: z.number() }), { x: 1 })     // → { x: 1 }
     * zodCast(z.object({ x: z.number() }), '{"x":1}')    // → { x: 1 }
     * zodCast(z.object({ x: z.number() }), { x: 'bad' }) // → undefined
     * zodCast(z.object({ x: z.number() }), null)          // → undefined
     */
    case 'object':
    case 'ZodObject': {
      if (raw === null || raw === undefined) return undefined;
      const obj = typeof raw === 'string' ? tryParseJson(raw) : raw;
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return undefined;
      const r = schema.safeParse(obj);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.array(…)` — JSON strings are parsed before validation.
     * Non-array and `null` values return `undefined`.
     *
     * @example
     * zodCast(z.array(z.number()), [1, 2, 3])    // → [1, 2, 3]
     * zodCast(z.array(z.number()), '[1,2,3]')    // → [1, 2, 3]
     * zodCast(z.array(z.number()), ['a', 'b'])   // → undefined
     * zodCast(z.array(z.number()), null)          // → undefined
     */
    case 'array':
    case 'ZodArray': {
      if (raw === null || raw === undefined) return undefined;
      const arr = typeof raw === 'string' ? tryParseJson(raw) : raw;
      if (!Array.isArray(arr)) return undefined;
      const r = schema.safeParse(arr);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.tuple(…)` — JSON strings are parsed before validation.
     *
     * @example
     * zodCast(z.tuple([z.string(), z.number()]), ['hello', 42])    // → ['hello', 42]
     * zodCast(z.tuple([z.string(), z.number()]), '["world", 99]')  // → ['world', 99]
     */
    case 'tuple':
    case 'ZodTuple': {
      if (raw === null || raw === undefined) return undefined;
      const arr = typeof raw === 'string' ? tryParseJson(raw) : raw;
      const r = schema.safeParse(arr);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.record(…)` — JSON strings are parsed before validation.
     *
     * @example
     * zodCast(z.record(z.string(), z.number()), { a: 1 })   // → { a: 1 }
     * zodCast(z.record(z.string(), z.number()), '{"x":10}') // → { x: 10 }
     */
    case 'record':
    case 'ZodRecord': {
      if (raw === null || raw === undefined) return undefined;
      const obj = typeof raw === 'string' ? tryParseJson(raw) : raw;
      const r = schema.safeParse(obj);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.set(…)` — accepts a native `Set`, a JSON array string, or a plain array.
     * Each item is recursively cast via `zodCast` using the set's item schema.
     *
     * @example
     * zodCast(z.set(z.string()), new Set(['a', 'b'])) // → Set { 'a', 'b' }
     * zodCast(z.set(z.string()), ['a', 'b'])           // → Set { 'a', 'b' }
     * zodCast(z.set(z.string()), '["x","y"]')          // → Set { 'x', 'y' }
     */
    case 'set':
    case 'ZodSet': {
      if (raw === null || raw === undefined) return undefined;
      if (raw instanceof Set) return raw as z.infer<T>;
      const arr = typeof raw === 'string' ? tryParseJson(raw) : raw;
      if (!Array.isArray(arr)) return undefined;
      const itemSchema = (schema as any)._def.valueType as z.ZodTypeAny;
      const set = new Set(arr.map((item: unknown) => zodCast(itemSchema, item)));
      const r = schema.safeParse(set);
      return r.success ? r.data : undefined;
    }

    /**
     * `z.map(…)` — accepts a native `Map` or an array of `[key, value]` pairs.
     * Keys and values are each recursively cast via `zodCast`. JSON strings of
     * pair arrays are also accepted.
     *
     * @example
     * zodCast(z.map(z.string(), z.number()), new Map([['a', 1]])) // → Map { 'a' => 1 }
     * zodCast(z.map(z.string(), z.number()), [['a', 1], ['b', 2]]) // → Map { 'a' => 1, 'b' => 2 }
     */
    case 'map':
    case 'ZodMap': {
      if (raw === null || raw === undefined) return undefined;
      if (raw instanceof Map) return raw as z.infer<T>;
      const pairs = typeof raw === 'string' ? tryParseJson(raw) : raw;
      if (!Array.isArray(pairs)) return undefined;
      const keySchema = (schema as any)._def.keyType as z.ZodTypeAny;
      const valSchema = (schema as any)._def.valueType as z.ZodTypeAny;
      const map = new Map(
        pairs.map(([k, v]: [unknown, unknown]) => [zodCast(keySchema, k), zodCast(valSchema, v)])
      );
      const r = schema.safeParse(map);
      return r.success ? r.data : undefined;
    }

    // ── Union / Intersection ───────────────────────────────────────────────────

    /**
     * `z.union(…)` / `z.discriminatedUnion(…)` — tries each option in two passes:
     * 1. **Exact pass:** `option.safeParse(raw)` — avoids string winning over number
     * 2. **Coercion pass:** `zodCast(option, raw)` — allows string → number coercion
     *
     * In Zod 4.x, both `ZodUnion` and `ZodDiscriminatedUnion` share `_def.type === 'union'`.
     *
     * @example
     * const schema = z.union([z.string(), z.number()]);
     * zodCast(schema, 'hello') // → 'hello'
     * zodCast(schema, 42)      // → 42
     * zodCast(schema, null)    // → undefined
     */
    case 'union':
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const rawOptions = (schema as any)._def.options;
      const options: z.ZodTypeAny[] =
        rawOptions instanceof Map ? [...rawOptions.values()] : rawOptions ?? [];
      for (const option of options) {
        const r = option.safeParse(raw);
        if (r.success) return r.data as z.infer<T>;
      }
      for (const option of options) {
        const result = zodCast(option, raw);
        if (result !== undefined) return result as z.infer<T>;
      }
      return undefined;
    }

    /**
     * `z.intersection(…)` — coerces via `asJsonComplex` then delegates to
     * `schema.safeParse`. Both sides of the intersection must be satisfied.
     *
     * @example
     * const schema = z.intersection(
     *   z.object({ a: z.string() }),
     *   z.object({ b: z.number() })
     * );
     * zodCast(schema, { a: 'x', b: 1 }) // → { a: 'x', b: 1 }
     */
    case 'intersection':
    case 'ZodIntersection': {
      if (raw === null || raw === undefined) return undefined;
      const val = asJsonComplex(raw);
      const r = schema.safeParse(val);
      return r.success ? r.data : undefined;
    }

    // ── Wrappers ──────────────────────────────────────────────────────────────

    /**
     * `z.optional(…)` — `undefined` → `undefined` (passthrough).
     * `null` is delegated to Zod: if the inner schema accepts `null`, it passes through;
     * otherwise returns `undefined`. All other values are delegated to the inner schema.
     *
     * @example
     * zodCast(z.optional(z.string()), 'hello')    // → 'hello'
     * zodCast(z.optional(z.string()), undefined)  // → undefined
     * zodCast(z.optional(z.string()), null)        // → undefined
     */
    case 'optional':
    case 'ZodOptional': {
      if (raw === undefined) return undefined;
      if (raw === null) {
        const r = schema.safeParse(raw);
        return r.success ? (r.data as z.infer<T>) : undefined;
      }
      const inner = innerType(schema);
      return inner ? (zodCast(inner, raw) as z.infer<T>) : undefined;
    }

    /**
     * `z.nullable(…)` — `null` or `'null'` → `null`.
     * `undefined` → `undefined`. Other values are delegated to the inner schema.
     *
     * @example
     * zodCast(z.nullable(z.string()), 'hello') // → 'hello'
     * zodCast(z.nullable(z.string()), null)    // → null
     * zodCast(z.nullable(z.string()), 'null')  // → null
     * zodCast(z.nullable(z.string()), undefined) // → undefined
     */
    case 'nullable':
    case 'ZodNullable': {
      if (raw === null || raw === 'null') return null as z.infer<T>;
      if (raw === undefined) return undefined;
      const inner = innerType(schema);
      return inner ? (zodCast(inner, raw) as z.infer<T>) : undefined;
    }

    /**
     * `z.default(value)` — returns the schema's default value when `raw` is
     * `null` or `undefined`. Also returns the default when the inner coercion fails.
     *
     * Handles both Zod 4.x (`_def.defaultValue` is a direct value) and
     * Zod 3.x (`_def.defaultValue` is a factory function).
     *
     * @example
     * const schema = z.string().default('fallback');
     * zodCast(schema, 'hello')    // → 'hello'
     * zodCast(schema, null)       // → 'fallback'
     * zodCast(schema, undefined)  // → 'fallback'
     */
    case 'default':
    case 'ZodDefault': {
      const inner = innerType(schema);
      if (!inner) return undefined;
      if (raw === null || raw === undefined) {
        const dv = (schema as any)._def.defaultValue;
        return (typeof dv === 'function' ? dv() : dv) as z.infer<T>;
      }
      const result = zodCast(inner, raw);
      if (result === undefined) {
        const dv = (schema as any)._def.defaultValue;
        return (typeof dv === 'function' ? dv() : dv) as z.infer<T>;
      }
      return result as z.infer<T>;
    }

    /**
     * `z.catch(value)` — returns the catch value when the inner coercion returns
     * `undefined`. Lets you define a type-safe fallback for invalid stored data.
     *
     * @example
     * const schema = z.number().catch(0);
     * zodCast(schema, 42)             // → 42
     * zodCast(schema, 'not-a-number') // → 0  (catch value)
     */
    case 'catch':
    case 'ZodCatch': {
      const inner = innerType(schema);
      if (!inner) return undefined;
      const result = zodCast(inner, raw);
      if (result === undefined) {
        return (schema as any)._def.catchValue({ error: undefined, input: raw }) as z.infer<T>;
      }
      return result as z.infer<T>;
    }

    /**
     * `z.readonly(…)` — transparent wrapper; delegates to the inner schema.
     *
     * @example
     * const schema = z.object({ x: z.number() }).readonly();
     * zodCast(schema, { x: 5 }) // → { x: 5 }
     */
    case 'readonly':
    case 'ZodReadonly': {
      const inner = innerType(schema);
      return inner ? (zodCast(inner, raw) as z.infer<T>) : undefined;
    }

    // ── Pipe (Zod v4): transforms, pipelines, and branded schemas ─────────────
    //
    // In Zod 4.x: `z.string().transform(…)`, `z.string().pipe(…)`, and
    // `z.string().brand()` all produce `_def.type === 'pipe'` (or keep the
    // source type for brands). We cast via the "in" schema to get an intermediate
    // value, then run the full pipeline via `schema.safeParse`.

    /**
     * `z.pipe(…)` / `z.transform(…)` / `z.refine(…)` (Zod 4 `ZodEffects`) —
     * coerces via the input schema first, then runs the full pipeline (including
     * transforms and refinements) via `schema.safeParse`.
     *
     * @example
     * // transform
     * zodCast(z.string().transform((s) => s.toUpperCase()), 'hello') // → 'HELLO'
     *
     * // pipe
     * zodCast(z.string().pipe(z.coerce.number()), '42') // → 42
     *
     * // refine
     * zodCast(z.number().refine((n) => n > 0), 5)  // → 5
     * zodCast(z.number().refine((n) => n > 0), -1) // → undefined
     */
    case 'pipe':
    case 'ZodPipeline':
    case 'ZodEffects': {
      const inSchema: z.ZodTypeAny =
        (schema as any)._def.in ?? (schema as any)._def.schema ?? undefined;
      if (!inSchema) return undefined;
      const intermediate = zodCast(inSchema, raw);
      if (intermediate === undefined) return undefined;
      const r = schema.safeParse(intermediate);
      return r.success ? r.data : undefined;
    }

    // ── Any / Unknown ─────────────────────────────────────────────────────────

    /**
     * `z.any()` / `z.unknown()` — accepts any value.
     * JSON strings are parsed to their structured form (object or array).
     * `null` and `undefined` are returned as-is.
     *
     * @example
     * zodCast(z.any(), 'hello')      // → 'hello'
     * zodCast(z.any(), '{"x":1}')   // → { x: 1 }  (parsed)
     * zodCast(z.any(), null)         // → null
     * zodCast(z.unknown(), [1, 2])   // → [1, 2]
     */
    case 'any':
    case 'unknown':
    case 'ZodAny':
    case 'ZodUnknown': {
      if (raw === null || raw === undefined) return raw as z.infer<T>;
      if (typeof raw === 'string') {
        const parsed = tryParseJson(raw);
        return (parsed !== undefined ? parsed : raw) as z.infer<T>;
      }
      return raw as z.infer<T>;
    }

    /**
     * `z.never()` — always returns `undefined` because no value satisfies `never`.
     */
    case 'never':
    case 'ZodNever': {
      return undefined;
    }

    /**
     * `z.promise(…)` / `z.function(…)` — not serializable; always returns `undefined`.
     */
    case 'promise':
    case 'function':
    case 'ZodPromise':
    case 'ZodFunction': {
      return undefined;
    }

    // ── Fallback ──────────────────────────────────────────────────────────────

    /**
     * Fallback for any unrecognised schema types (e.g. future Zod additions).
     * Attempts JSON parsing when the raw value is a string, then delegates
     * to `schema.safeParse`.
     */
    default: {
      const val = asJsonComplex(raw);
      const r = schema.safeParse(val);
      return r.success ? r.data : undefined;
    }
  }
}
