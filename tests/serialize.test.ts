// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeEntry, decodeEntry, isPlainObject, isJsonString } from '../src/serialize';

// ─── encodeEntry / decodeEntry ────────────────────────────────────────────────

describe('encodeEntry + decodeEntry round-trip', () => {
  it('string value', () => {
    const raw = encodeEntry('hello');
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: 'hello', expired: false });
  });

  it('number value', () => {
    const raw = encodeEntry(42);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: 42, expired: false });
  });

  it('boolean value', () => {
    const raw = encodeEntry(false);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: false, expired: false });
  });

  it('null value', () => {
    const raw = encodeEntry(null);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: null, expired: false });
  });

  it('object value', () => {
    const raw = encodeEntry({ name: 'Alice', age: 30 });
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: { name: 'Alice', age: 30 }, expired: false });
  });

  it('array value', () => {
    const raw = encodeEntry([1, 2, 3]);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: [1, 2, 3], expired: false });
  });

  it('nested object', () => {
    const raw = encodeEntry({ a: { b: { c: true } } });
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: { a: { b: { c: true } } }, expired: false });
  });
});

describe('encodeEntry TTL / expiry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('entry is not expired before TTL', () => {
    const raw = encodeEntry('value', { ttl: 5000 });
    vi.advanceTimersByTime(4999);
    const result = decodeEntry(raw);
    expect(result?.expired).toBe(false);
  });

  it('entry is expired after TTL', () => {
    const raw = encodeEntry('value', { ttl: 5000 });
    vi.advanceTimersByTime(5001);
    const result = decodeEntry(raw);
    expect(result?.expired).toBe(true);
  });

  it('no expiry when ttl is 0', () => {
    const raw = encodeEntry('value', { ttl: 0 });
    vi.advanceTimersByTime(9999999);
    const result = decodeEntry(raw);
    expect(result?.expired).toBe(false);
  });

  it('no expiry when ttl is omitted', () => {
    const raw = encodeEntry('value');
    vi.advanceTimersByTime(9999999);
    const result = decodeEntry(raw);
    expect(result?.expired).toBe(false);
  });
});

describe('decodeEntry edge cases', () => {
  it('returns null for invalid JSON', () => {
    expect(decodeEntry('not-json')).toBeNull();
  });

  it('returns null for JSON that is not an envelope (no "v" key)', () => {
    expect(decodeEntry('{"x":1}')).toBeNull();
  });

  it('returns null for JSON null', () => {
    expect(decodeEntry('null')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeEntry('')).toBeNull();
  });

  it('handles envelope with value: 0 correctly (falsy but valid)', () => {
    const raw = encodeEntry(0);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: 0, expired: false });
  });

  it('handles envelope with value: false correctly', () => {
    const raw = encodeEntry(false);
    const result = decodeEntry(raw);
    expect(result).toEqual({ value: false, expired: false });
  });
});

// ─── isPlainObject ────────────────────────────────────────────────────────────

describe('isPlainObject', () => {
  it('returns true for a plain object literal', () => expect(isPlainObject({})).toBe(true));
  it('returns true for object with null prototype', () =>
    expect(isPlainObject(Object.create(null))).toBe(true));
  it('returns true for a non-empty plain object', () =>
    expect(isPlainObject({ a: 1 })).toBe(true));

  it('returns false for arrays', () => expect(isPlainObject([])).toBe(false));
  it('returns false for null', () => expect(isPlainObject(null)).toBe(false));
  it('returns false for string', () => expect(isPlainObject('hello')).toBe(false));
  it('returns false for number', () => expect(isPlainObject(42)).toBe(false));
  it('returns false for boolean', () => expect(isPlainObject(true)).toBe(false));
  it('returns false for undefined', () => expect(isPlainObject(undefined)).toBe(false));
  it('returns false for class instances', () => expect(isPlainObject(new Date())).toBe(false));
  it('returns false for Map', () => expect(isPlainObject(new Map())).toBe(false));
  it('returns false for Set', () => expect(isPlainObject(new Set())).toBe(false));
});

// ─── isJsonString ─────────────────────────────────────────────────────────────

describe('isJsonString', () => {
  it('returns true for JSON object string', () => expect(isJsonString('{"a":1}')).toBe(true));
  it('returns true for JSON array string', () => expect(isJsonString('[1,2,3]')).toBe(true));
  it('returns true for nested JSON', () =>
    expect(isJsonString('{"a":{"b":true}}')).toBe(true));

  it('returns false for plain string', () => expect(isJsonString('hello')).toBe(false));
  it('returns false for number string', () => expect(isJsonString('42')).toBe(false));
  it('returns false for boolean string', () => expect(isJsonString('true')).toBe(false));
  it('returns false for null string', () => expect(isJsonString('null')).toBe(false));
  it('returns false for non-string', () => expect(isJsonString(42)).toBe(false));
  it('returns false for null', () => expect(isJsonString(null)).toBe(false));
  it('returns false for undefined', () => expect(isJsonString(undefined)).toBe(false));
  it('returns false for invalid JSON', () => expect(isJsonString('{broken')).toBe(false));
  it('returns false for empty string', () => expect(isJsonString('')).toBe(false));
});
