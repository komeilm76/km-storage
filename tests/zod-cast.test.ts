// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodCast } from '../src/zod-cast';

// ─── Primitives ───────────────────────────────────────────────────────────────

describe('ZodString', () => {
  const schema = z.string();
  it('passes a string through', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('coerces number to string', () => expect(zodCast(schema, 42)).toBe('42'));
  it('coerces boolean to string', () => expect(zodCast(schema, true)).toBe('true'));
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
  it('returns undefined for undefined', () => expect(zodCast(schema, undefined)).toBeUndefined());
  it('honours string refinements', () => {
    const email = z.string().email();
    expect(zodCast(email, 'a@b.com')).toBe('a@b.com');
    expect(zodCast(email, 'not-an-email')).toBeUndefined();
  });
});

describe('ZodNumber', () => {
  const schema = z.number();
  it('passes a number through', () => expect(zodCast(schema, 42)).toBe(42));
  it('parses a numeric string', () => expect(zodCast(schema, '3.14')).toBe(3.14));
  it('parses negative numeric string', () => expect(zodCast(schema, '-7')).toBe(-7));
  it('returns undefined for non-numeric string', () => expect(zodCast(schema, 'abc')).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
  it('returns undefined for Infinity', () => expect(zodCast(schema, 'Infinity')).toBeUndefined());
  it('honours min/max', () => {
    const clamped = z.number().min(0).max(10);
    expect(zodCast(clamped, '5')).toBe(5);
    expect(zodCast(clamped, '99')).toBeUndefined();
  });
});

describe('ZodBoolean', () => {
  const schema = z.boolean();
  it('passes true through', () => expect(zodCast(schema, true)).toBe(true));
  it('passes false through', () => expect(zodCast(schema, false)).toBe(false));
  it('casts string "true"', () => expect(zodCast(schema, 'true')).toBe(true));
  it('casts string "false"', () => expect(zodCast(schema, 'false')).toBe(false));
  it('returns undefined for other strings', () => expect(zodCast(schema, 'yes')).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodBigInt', () => {
  const schema = z.bigint();
  it('passes a bigint through', () => expect(zodCast(schema, 42n)).toBe(42n));
  it('parses a numeric string', () => expect(zodCast(schema, '9007199254740993')).toBe(9007199254740993n));
  it('returns undefined for non-numeric string', () => expect(zodCast(schema, 'abc')).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodDate', () => {
  const schema = z.date();
  const d = new Date('2024-01-15T00:00:00.000Z');
  it('passes a Date through', () => expect(zodCast(schema, d)).toEqual(d));
  it('parses an ISO string', () => expect(zodCast(schema, '2024-01-15T00:00:00.000Z')).toEqual(d));
  it('parses a timestamp number', () => expect(zodCast(schema, d.getTime())).toEqual(d));
  it('returns undefined for invalid date string', () => expect(zodCast(schema, 'not-a-date')).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodNull', () => {
  const schema = z.null();
  it('passes null through', () => expect(zodCast(schema, null)).toBeNull());
  it('casts string "null"', () => expect(zodCast(schema, 'null')).toBeNull());
  it('returns undefined for non-null', () => expect(zodCast(schema, 'hello')).toBeUndefined());
});

describe('ZodUndefined', () => {
  const schema = z.undefined();
  it('returns undefined', () => expect(zodCast(schema, undefined)).toBeUndefined());
  it('returns undefined for any input', () => expect(zodCast(schema, 'anything')).toBeUndefined());
});

describe('ZodNaN', () => {
  const schema = z.nan();
  it('passes NaN through', () => expect(zodCast(schema, NaN)).toBeNaN());
  it('casts string "NaN"', () => expect(zodCast(schema, 'NaN')).toBeNaN());
  it('returns undefined for a valid number', () => expect(zodCast(schema, 42)).toBeUndefined());
});

// ─── Literal / Enum ───────────────────────────────────────────────────────────

describe('ZodLiteral', () => {
  it('matches string literal', () => expect(zodCast(z.literal('km'), 'km')).toBe('km'));
  it('matches numeric literal from number', () => expect(zodCast(z.literal(42), 42)).toBe(42));
  it('matches numeric literal from string', () => expect(zodCast(z.literal(42), '42')).toBe(42));
  it('matches boolean literal true', () => expect(zodCast(z.literal(true), 'true')).toBe(true));
  it('matches boolean literal false', () => expect(zodCast(z.literal(false), 'false')).toBe(false));
  it('returns undefined for wrong value', () => expect(zodCast(z.literal('km'), 'other')).toBeUndefined());
});

describe('ZodEnum', () => {
  const schema = z.enum(['a', 'b', 'c']);
  it('returns a valid enum value', () => expect(zodCast(schema, 'a')).toBe('a'));
  it('returns undefined for invalid value', () => expect(zodCast(schema, 'd')).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodNativeEnum', () => {
  enum Direction {
    Up = 'UP',
    Down = 'DOWN',
  }
  enum Code {
    Ok = 0,
    Err = 1,
  }
  const strSchema = z.nativeEnum(Direction);
  const numSchema = z.nativeEnum(Code);

  it('accepts a valid string enum value', () => expect(zodCast(strSchema, 'UP')).toBe('UP'));
  it('returns undefined for invalid string enum value', () => expect(zodCast(strSchema, 'LEFT')).toBeUndefined());
  it('accepts a valid numeric enum value', () => expect(zodCast(numSchema, 0)).toBe(0));
  it('parses numeric enum from string', () => expect(zodCast(numSchema, '1')).toBe(1));
});

// ─── Object / Collection ──────────────────────────────────────────────────────

describe('ZodObject', () => {
  const schema = z.object({ name: z.string(), age: z.number() });
  it('passes a valid object through', () =>
    expect(zodCast(schema, { name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 }));
  it('parses from JSON string', () =>
    expect(zodCast(schema, '{"name":"Bob","age":25}')).toEqual({ name: 'Bob', age: 25 }));
  it('returns undefined for invalid object', () =>
    expect(zodCast(schema, { name: 123 })).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
  it('returns undefined for non-object string', () =>
    expect(zodCast(schema, 'hello')).toBeUndefined());
});

describe('ZodArray', () => {
  const schema = z.array(z.number());
  it('passes a valid array through', () =>
    expect(zodCast(schema, [1, 2, 3])).toEqual([1, 2, 3]));
  it('parses from JSON string', () =>
    expect(zodCast(schema, '[1,2,3]')).toEqual([1, 2, 3]));
  it('returns undefined for invalid array', () =>
    expect(zodCast(schema, ['a', 'b'])).toBeUndefined());
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodRecord', () => {
  const schema = z.record(z.string(), z.number());
  it('passes a valid record through', () =>
    expect(zodCast(schema, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 }));
  it('parses from JSON string', () =>
    expect(zodCast(schema, '{"x":10}')).toEqual({ x: 10 }));
  it('returns undefined for wrong value types', () =>
    expect(zodCast(schema, { a: 'not-a-number' })).toBeUndefined());
});

describe('ZodTuple', () => {
  const schema = z.tuple([z.string(), z.number()]);
  it('passes a valid tuple through', () =>
    expect(zodCast(schema, ['hello', 42])).toEqual(['hello', 42]));
  it('parses from JSON string', () =>
    expect(zodCast(schema, '["world",99]')).toEqual(['world', 99]));
  it('returns undefined for wrong types', () =>
    expect(zodCast(schema, [42, 'hello'])).toBeUndefined());
});

describe('ZodSet', () => {
  const schema = z.set(z.string());
  it('passes a Set through', () =>
    expect(zodCast(schema, new Set(['a', 'b']))).toEqual(new Set(['a', 'b'])));
  it('builds a Set from an array', () =>
    expect(zodCast(schema, ['a', 'b'])).toEqual(new Set(['a', 'b'])));
  it('parses from JSON string array', () =>
    expect(zodCast(schema, '["x","y"]')).toEqual(new Set(['x', 'y'])));
});

describe('ZodMap', () => {
  const schema = z.map(z.string(), z.number());
  it('passes a Map through', () =>
    expect(zodCast(schema, new Map([['a', 1]]))).toEqual(new Map([['a', 1]])));
  it('builds a Map from array of pairs', () =>
    expect(zodCast(schema, [['a', 1], ['b', 2]])).toEqual(new Map([['a', 1], ['b', 2]])));
});

// ─── Union / Intersection ─────────────────────────────────────────────────────

describe('ZodUnion', () => {
  const schema = z.union([z.string(), z.number()]);
  it('returns a string match', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('returns a number match', () => expect(zodCast(schema, 42)).toBe(42));
  it('returns undefined when no option matches', () =>
    expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodDiscriminatedUnion', () => {
  const schema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('a'), value: z.string() }),
    z.object({ type: z.literal('b'), value: z.number() }),
  ]);
  it('matches the first variant', () =>
    expect(zodCast(schema, { type: 'a', value: 'hello' })).toEqual({ type: 'a', value: 'hello' }));
  it('matches the second variant', () =>
    expect(zodCast(schema, { type: 'b', value: 99 })).toEqual({ type: 'b', value: 99 }));
  it('returns undefined for unknown discriminator', () =>
    expect(zodCast(schema, { type: 'c', value: 'x' })).toBeUndefined());
});

// ─── Wrappers ─────────────────────────────────────────────────────────────────

describe('ZodOptional', () => {
  const schema = z.optional(z.string());
  it('returns a value when present', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('returns undefined for null', () => expect(zodCast(schema, null)).toBeUndefined());
  it('returns undefined for undefined', () => expect(zodCast(schema, undefined)).toBeUndefined());
});

describe('ZodNullable', () => {
  const schema = z.nullable(z.string());
  it('returns a value when present', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('returns null for null', () => expect(zodCast(schema, null)).toBeNull());
  it('returns null for string "null"', () => expect(zodCast(schema, 'null')).toBeNull());
  it('returns undefined for undefined', () => expect(zodCast(schema, undefined)).toBeUndefined());
});

describe('ZodDefault', () => {
  const schema = z.string().default('fallback');
  it('returns value when present', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('returns default for null', () => expect(zodCast(schema, null)).toBe('fallback'));
  it('returns default for undefined', () => expect(zodCast(schema, undefined)).toBe('fallback'));
});

describe('ZodCatch', () => {
  const schema = z.number().catch(0);
  it('returns value when valid', () => expect(zodCast(schema, 42)).toBe(42));
  it('returns catch value when cast fails', () => expect(zodCast(schema, 'not-a-number')).toBe(0));
});

describe('ZodBranded', () => {
  const UserId = z.string().brand<'UserId'>();
  it('returns the underlying value', () => expect(zodCast(UserId, 'user-123')).toBe('user-123'));
  it('returns undefined for null', () => expect(zodCast(UserId, null)).toBeUndefined());
});

describe('ZodReadonly', () => {
  const schema = z.object({ x: z.number() }).readonly();
  it('returns a readonly object', () =>
    expect(zodCast(schema, { x: 5 })).toEqual({ x: 5 }));
});

// ─── Effects / Transforms ─────────────────────────────────────────────────────

describe('ZodEffects (transform)', () => {
  const schema = z.string().transform((s) => s.toUpperCase());
  it('applies transform', () => expect(zodCast(schema, 'hello')).toBe('HELLO'));
  it('returns undefined for non-string', () => expect(zodCast(schema, null)).toBeUndefined());
});

describe('ZodEffects (refine)', () => {
  const schema = z.number().refine((n) => n > 0, 'Must be positive');
  it('passes valid value', () => expect(zodCast(schema, 5)).toBe(5));
  it('returns undefined for invalid value', () => expect(zodCast(schema, -1)).toBeUndefined());
});

describe('ZodPipeline', () => {
  const schema = z.string().pipe(z.coerce.number());
  it('pipes string to coerced number', () => expect(zodCast(schema, '42')).toBe(42));
});

// ─── Any / Unknown ────────────────────────────────────────────────────────────

describe('ZodAny', () => {
  const schema = z.any();
  it('returns value as-is', () => expect(zodCast(schema, 'hello')).toBe('hello'));
  it('parses JSON strings', () => expect(zodCast(schema, '{"x":1}')).toEqual({ x: 1 }));
  it('returns null as-is', () => expect(zodCast(schema, null)).toBeNull());
});

describe('ZodUnknown', () => {
  const schema = z.unknown();
  it('returns value as-is', () => expect(zodCast(schema, 42)).toBe(42));
  it('parses JSON strings', () => expect(zodCast(schema, '[1,2]')).toEqual([1, 2]));
});

// ─── Composed / Nested ────────────────────────────────────────────────────────

describe('Nested schemas', () => {
  it('optional object', () => {
    const schema = z.optional(z.object({ name: z.string() }));
    expect(zodCast(schema, { name: 'Alice' })).toEqual({ name: 'Alice' });
    expect(zodCast(schema, null)).toBeUndefined();
  });

  it('nullable array', () => {
    const schema = z.nullable(z.array(z.number()));
    expect(zodCast(schema, [1, 2])).toEqual([1, 2]);
    expect(zodCast(schema, null)).toBeNull();
  });

  it('optional nullable string', () => {
    const schema = z.optional(z.nullable(z.string()));
    expect(zodCast(schema, 'hello')).toBe('hello');
    expect(zodCast(schema, 'null')).toBeNull();
    // null is valid because the inner schema is nullable — Zod itself returns null here
    expect(zodCast(schema, null)).toBeNull();
  });

  it('array of objects from JSON string', () => {
    const schema = z.array(z.object({ id: z.number() }));
    expect(zodCast(schema, '[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('default nested object', () => {
    const schema = z.object({ count: z.number() }).default({ count: 0 });
    expect(zodCast(schema, null)).toEqual({ count: 0 });
    expect(zodCast(schema, { count: 5 })).toEqual({ count: 5 });
  });
});
