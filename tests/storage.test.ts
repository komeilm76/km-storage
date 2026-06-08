// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { createStorage } from '../src/storage';

// ─── Schema used across all tests ─────────────────────────────────────────────

const schema = z.object({
  username: z.string(),
  age: z.number(),
  active: z.boolean(),
  score: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

function makeStore(overrides?: Parameters<typeof createStorage>[1]) {
  return createStorage(schema, { prefix: 'test', ...overrides });
}

// ─── Basic CRUD ───────────────────────────────────────────────────────────────

describe('create + read', () => {
  beforeEach(() => localStorage.clear());

  it('stores and retrieves a string', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    expect(store.read('username')).toBe('Alice');
  });

  it('stores and retrieves a number', () => {
    const store = makeStore();
    store.create('age', 30);
    expect(store.read('age')).toBe(30);
  });

  it('stores and retrieves a boolean', () => {
    const store = makeStore();
    store.create('active', true);
    expect(store.read('active')).toBe(true);
  });

  it('stores and retrieves an array', () => {
    const store = makeStore();
    store.create('tags', ['ts', 'js']);
    expect(store.read('tags')).toEqual(['ts', 'js']);
  });

  it('returns undefined for a key not yet written', () => {
    const store = makeStore();
    expect(store.read('username')).toBeUndefined();
  });

  it('throws a ZodError when the value fails schema validation', () => {
    const store = makeStore();
    expect(() => store.create('age', 'not-a-number' as any)).toThrow();
  });

  it('replaces an existing value on create', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    store.create('username', 'Bob');
    expect(store.read('username')).toBe('Bob');
  });

  it('uses the prefix to isolate keys', () => {
    const store = makeStore({ prefix: 'app' });
    store.create('username', 'Alice');
    expect(localStorage.getItem('app:username')).not.toBeNull();
    expect(localStorage.getItem('test:username')).toBeNull();
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('update', () => {
  beforeEach(() => localStorage.clear());

  it('replaces value with a plain value', () => {
    const store = makeStore();
    store.create('age', 20);
    store.update('age', 21);
    expect(store.read('age')).toBe(21);
  });

  it('applies a functional updater', () => {
    const store = makeStore();
    store.create('age', 10);
    store.update('age', (prev) => (prev ?? 0) + 5);
    expect(store.read('age')).toBe(15);
  });

  it('functional updater receives undefined when key is absent', () => {
    const store = makeStore();
    store.update('age', (prev) => (prev ?? 0) + 1);
    expect(store.read('age')).toBe(1);
  });

  it('throws a ZodError when the updated value is invalid', () => {
    const store = makeStore();
    store.create('age', 10);
    expect(() => store.update('age', 'not-a-number' as any)).toThrow();
  });
});

// ─── remove / removeAll ───────────────────────────────────────────────────────

describe('remove', () => {
  beforeEach(() => localStorage.clear());

  it('removes an existing entry', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    store.remove('username');
    expect(store.read('username')).toBeUndefined();
  });

  it('is a no-op for a non-existent key', () => {
    const store = makeStore();
    expect(() => store.remove('username')).not.toThrow();
  });
});

describe('removeAll', () => {
  beforeEach(() => localStorage.clear());

  it('removes all entries belonging to this store', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    store.create('age', 30);
    store.create('active', true);
    store.removeAll();
    expect(store.read('username')).toBeUndefined();
    expect(store.read('age')).toBeUndefined();
    expect(store.read('active')).toBeUndefined();
  });

  it('does not remove entries from a different prefix', () => {
    const store1 = createStorage(schema, { prefix: 'a' });
    const store2 = createStorage(schema, { prefix: 'b' });
    store1.create('username', 'Alice');
    store2.create('username', 'Bob');
    store1.removeAll();
    expect(store2.read('username')).toBe('Bob');
  });
});

// ─── readAll ──────────────────────────────────────────────────────────────────

describe('readAll', () => {
  beforeEach(() => localStorage.clear());

  it('returns all written entries', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    store.create('age', 30);
    store.create('active', false);
    const all = store.readAll();
    expect(all.username).toBe('Alice');
    expect(all.age).toBe(30);
    expect(all.active).toBe(false);
  });

  it('returns undefined for keys not written', () => {
    const store = makeStore();
    const all = store.readAll();
    expect(all.username).toBeUndefined();
  });
});

// ─── TTL / expiry ─────────────────────────────────────────────────────────────

describe('TTL (expire-time)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('value is readable before TTL expires', () => {
    const store = makeStore();
    store.create('username', 'Alice', { ttl: 5000 });
    vi.advanceTimersByTime(4999);
    expect(store.read('username')).toBe('Alice');
  });

  it('value is undefined and auto-removed after TTL expires', () => {
    const store = makeStore();
    store.create('username', 'Alice', { ttl: 5000 });
    vi.advanceTimersByTime(5001);
    expect(store.read('username')).toBeUndefined();
    expect(localStorage.getItem('test:username')).toBeNull();
  });

  it('update can reset TTL', () => {
    const store = makeStore();
    store.create('username', 'Alice', { ttl: 3000 });
    vi.advanceTimersByTime(2000);
    store.update('username', 'Bob', { ttl: 10000 });
    vi.advanceTimersByTime(5000);
    expect(store.read('username')).toBe('Bob');
  });
});

// ─── watch ────────────────────────────────────────────────────────────────────

describe('watch', () => {
  beforeEach(() => localStorage.clear());

  it('fires when a value is created', () => {
    const store = makeStore();
    const cb = vi.fn();
    store.watch('username', cb);
    store.create('username', 'Alice');
    expect(cb).toHaveBeenCalledWith('Alice', undefined);
  });

  it('fires when a value is updated', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    const cb = vi.fn();
    store.watch('username', cb);
    store.update('username', 'Bob');
    expect(cb).toHaveBeenCalledWith('Bob', 'Alice');
  });

  it('fires when a value is removed', () => {
    const store = makeStore();
    store.create('username', 'Alice');
    const cb = vi.fn();
    store.watch('username', cb);
    store.remove('username');
    expect(cb).toHaveBeenCalledWith(undefined, 'Alice');
  });

  it('stops firing after unsubscribe', () => {
    const store = makeStore();
    const cb = vi.fn();
    const unsubscribe = store.watch('username', cb);
    unsubscribe();
    store.create('username', 'Alice');
    expect(cb).not.toHaveBeenCalled();
  });

  it('supports multiple independent watchers on the same key', () => {
    const store = makeStore();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.watch('username', cb1);
    store.watch('username', cb2);
    store.create('username', 'Alice');
    expect(cb1).toHaveBeenCalledWith('Alice', undefined);
    expect(cb2).toHaveBeenCalledWith('Alice', undefined);
  });

  it('does not fire for a different key', () => {
    const store = makeStore();
    const cb = vi.fn();
    store.watch('username', cb);
    store.create('age', 30);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── sessionStorage mode ──────────────────────────────────────────────────────

describe('sessionStorage mode', () => {
  beforeEach(() => sessionStorage.clear());

  it('writes to sessionStorage when mode is sessionStorage', () => {
    const store = createStorage(schema, { prefix: 'sess', mode: 'sessionStorage' });
    store.create('username', 'Alice');
    expect(sessionStorage.getItem('sess:username')).not.toBeNull();
    expect(localStorage.getItem('sess:username')).toBeNull();
  });

  it('reads from sessionStorage correctly', () => {
    const store = createStorage(schema, { prefix: 'sess', mode: 'sessionStorage' });
    store.create('username', 'Alice');
    expect(store.read('username')).toBe('Alice');
  });
});

// ─── destroy ──────────────────────────────────────────────────────────────────

describe('destroy', () => {
  beforeEach(() => localStorage.clear());

  it('stops all watchers after destroy', () => {
    const store = makeStore();
    const cb = vi.fn();
    store.watch('username', cb);
    store.destroy();
    store.create('username', 'Alice');
    expect(cb).not.toHaveBeenCalled();
  });
});
