# km-storage — Type-Safe localStorage & sessionStorage with Zod Validation

[![npm version](https://img.shields.io/npm/v/km-storage.svg)](https://www.npmjs.com/package/km-storage)
[![license](https://img.shields.io/npm/l/km-storage.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-4.x-purple.svg)](https://zod.dev/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/km-storage)](https://bundlephobia.com/package/km-storage)

**km-storage** is a lightweight, fully typed browser storage library that wraps `localStorage` and `sessionStorage` with [Zod](https://zod.dev/) schema validation. Every read and write is validated against your schema — no more silently broken data, no more manual JSON parsing, and full TypeScript intellisense on every key.

---

## Table of Contents

- [Why km-storage?](#why-km-storage)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference — createStorage](#api-reference--createstorage)
  - [create](#create)
  - [read](#read)
  - [update](#update)
  - [remove](#remove)
  - [removeAll](#removeall)
  - [readAll](#readall)
  - [watch](#watch)
  - [destroy](#destroy)
- [Options Reference](#options-reference)
  - [StorageOptions](#storageoptions)
  - [CreateOptions (TTL)](#createoptions--ttl)
- [zodCast — Standalone Zod Coercion Utility](#zodcast--standalone-zod-coercion-utility)
- [Serialization Utilities](#serialization-utilities)
- [TypeScript Types](#typescript-types)
- [Advanced Usage](#advanced-usage)
  - [sessionStorage Mode](#sessionstorage-mode)
  - [Compression](#compression)
  - [Namespaced / Prefixed Stores](#namespaced--prefixed-stores)
  - [React — Watching Storage Changes](#react--watching-storage-changes)
  - [Multiple Stores with Shared Schema](#multiple-stores-with-shared-schema)
  - [TTL Patterns](#ttl-patterns)
- [Export Styles](#export-styles)
- [Version Compatibility](#version-compatibility)
- [Browser Compatibility](#browser-compatibility)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Why km-storage?

Most projects store data in `localStorage` with raw `JSON.stringify` / `JSON.parse`. This works until:

- A stored value silently becomes `null` or `"undefined"` after a refactor
- You forget that `localStorage` only stores strings, and read a number back as a string
- There is no warning when stored data no longer matches your current types
- You need reactive watchers for cross-tab state synchronization
- Stored entries pile up with no TTL mechanism

**km-storage** solves all of this with a single `createStorage(schema)` call:

```typescript
import { createStorage } from 'km-storage';
import { z } from 'zod';

const store = createStorage(
  z.object({
    token: z.string(),
    userId: z.number(),
    darkMode: z.boolean().default(false),
  }),
  { prefix: 'myapp' }
);

store.create('token', 'abc123');               // validated and stored
store.read('token');                            // → 'abc123' (typed as string)
store.read('userId');                           // → undefined (never written)
store.update('darkMode', (prev) => !prev);     // functional update pattern
```

---

## Features

- **Zod schema validation** — every `create` and `update` validates the value before writing; every `read` validates and coerces the stored value back to the correct type
- **Full TypeScript intellisense** — key names and value types are inferred directly from your Zod schema; wrong key names and wrong value types are compile errors
- **TTL (time-to-live)** — set a `ttl` in milliseconds per entry; expired entries are auto-removed on the next read
- **Reactive `watch()`** — subscribe to changes on any key, including cross-tab changes via the native `storage` event
- **Functional updater pattern** — `update('count', prev => (prev ?? 0) + 1)` — works exactly like React's `useState` setter
- **`sessionStorage` support** — switch any store to `sessionStorage` with one option
- **Optional compression** — zipson-powered compression for large payloads, reducing storage footprint by 30–70%
- **Prefix / namespace isolation** — multiple independent stores coexist in the same tab without key collisions
- **Standalone `zodCast` utility** — coerce any raw value (URL param, env var, form field) to a Zod-typed value; usable completely outside of km-storage
- **Zero lodash dependency** — pure TypeScript with no heavyweight utility belt
- **ESM + CJS + Universal builds** — works with Vite, webpack, Rollup, Next.js, and any bundler

---

## Installation

```bash
# npm
npm install km-storage zod

# yarn
yarn add km-storage zod

# pnpm
pnpm add km-storage zod

# bun
bun add km-storage zod
```

> **Note:** `zod` is a required peer dependency (`peerDependencies`). km-storage requires **Zod 4.x** (`>=4.0.0`). Both packages must be installed in your project.

---

## Quick Start

```typescript
import { createStorage } from 'km-storage';
import { z } from 'zod';

// 1. Define your schema
const schema = z.object({
  username: z.string(),
  age: z.number(),
  theme: z.enum(['light', 'dark']).default('light'),
  rememberMe: z.boolean().default(false),
  sessionToken: z.string().optional(),
});

// 2. Create a store — all keys are namespaced under 'app:'
const store = createStorage(schema, { prefix: 'app' });

// 3. Write (validated — throws ZodError on invalid data)
store.create('username', 'Alice');
store.create('age', 30);
store.create('theme', 'dark');

// 4. Read (fully typed return values)
store.read('username');      // → 'Alice' (string)
store.read('age');           // → 30 (number, not the string "30")
store.read('theme');         // → 'dark'
store.read('sessionToken');  // → undefined (was never written)

// 5. Update
store.update('age', 31);                          // plain value
store.update('age', (prev) => (prev ?? 0) + 1);  // functional updater

// 6. Delete
store.remove('sessionToken');
store.removeAll();  // removes all app: keys

// 7. Watch for changes (same-tab and cross-tab)
const unsubscribe = store.watch('username', (current, previous) => {
  console.log(`username changed from "${previous}" to "${current}"`);
});

store.create('username', 'Bob'); // → fires: "username changed from Alice to Bob"
unsubscribe();                   // stop watching

// 8. Teardown (e.g. on component unmount)
store.destroy();
```

---

## Core Concepts

### Schema-First Storage

Every `createStorage` call takes a `z.object()` as its first argument. This schema:

- defines the **keys** that can be stored (TypeScript prevents writing arbitrary keys not in the schema)
- defines the **type** of each value (TypeScript infers the exact return type of every `read` call)
- validates values **on write** and **coerces** them back on read via `zodCast`

### Envelope Pattern

Internally, every stored value is wrapped in a typed envelope:

```json
{ "v": <actualValue>, "e": <expiryTimestamp> }
```

This means:

- Primitives (`number`, `boolean`, `null`) survive the JSON round-trip without type coercion hacks — a stored `42` comes back as `42`, not `"42"`
- TTL expiry timestamps travel with the value and need no separate storage key
- Future metadata can be added to the envelope without breaking existing entries

### Prefix / Key Isolation

Every store is bound to a `prefix`. Keys in `localStorage` are stored as `prefix:keyName`. Two stores with different prefixes never interfere with each other.

```
app:username    → '{"v":"Alice"}'
app:theme       → '{"v":"dark"}'
admin:username  → '{"v":"superadmin"}'   ← separate store, no collision
```

---

## API Reference — createStorage

```typescript
function createStorage<SCHEMA extends z.ZodObject<any>, NAME extends string = string>(
  schema: SCHEMA,
  options?: StorageOptions<NAME>
): StorageInstance<z.infer<SCHEMA>>
```

Creates and returns a storage instance bound to the given Zod schema and options.

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `z.ZodObject<any>` | A Zod object schema defining the keys and types for this store |
| `options` | `StorageOptions` | Optional configuration (see [StorageOptions](#storageoptions)) |

**Returns:** a `StorageInstance<z.infer<SCHEMA>>` with the methods documented below.

---

### create

```typescript
store.create(name: K, value: Schema[K], options?: CreateOptions): void
```

Validates `value` against the field schema and writes it to storage. Throws a `ZodError` if the value is invalid. Replaces any existing entry for the same key.

```typescript
store.create('username', 'Alice');              // ok
store.create('age', 30);                        // ok
store.create('age', 'thirty' as any);           // throws ZodError — expected number

// With TTL: entry auto-expires after 60 seconds
store.create('sessionToken', 'tok_abc', { ttl: 60_000 });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `keyof Schema` | yes | Key name — must be a key in the Zod schema |
| `value` | `Schema[K]` | yes | Value to store — validated before writing |
| `options.ttl` | `number` | no | Time-to-live in **milliseconds**. Entry is auto-removed on the next read after expiry |

> After `create`, all registered `watch()` callbacks for that key fire synchronously with `(newValue, previousValue)`.

---

### read

```typescript
store.read(name: K): Schema[K] | undefined
```

Reads and returns the current value for `name`. Returns `undefined` if:

- the key was never written
- the stored envelope is malformed
- the entry's TTL has expired (the entry is auto-removed on this read)

The stored raw value is coerced back to the correct JavaScript type — a stored number is always returned as a `number`, not a string.

```typescript
store.create('age', 30);
store.read('age');        // → 30  (number)
store.read('username');   // → undefined  (never written)
```

---

### update

```typescript
store.update(
  name: K,
  value: Schema[K] | ((current: Schema[K] | undefined) => Schema[K]),
  options?: CreateOptions
): void
```

Updates an existing entry. Accepts either a **plain value** or a **functional updater** — a function that receives the current value and returns the next value. This pattern is identical to React's `useState` setter.

The updated value is validated through the schema before writing. Throws `ZodError` on invalid data.

```typescript
store.create('age', 10);

// Plain value
store.update('age', 20);

// Functional updater — receives current stored value
store.update('age', (prev) => (prev ?? 0) + 1);  // → 21

// Works even when the key was never written (prev is undefined)
store.update('age', (prev) => prev ?? 0);          // → 0 for a new key
```

`update` also accepts `options.ttl` to reset the expiry timer:

```typescript
// Extend the session token TTL on every user action
store.update('sessionToken', (prev) => prev ?? 'tok_abc', { ttl: 30_000 });
```

---

### remove

```typescript
store.remove(name: K): void
```

Removes the entry for the given key. Safe to call even if the key was never written (no-op). After removal, all `watch()` callbacks for that key fire with `(undefined, previousValue)`.

```typescript
store.create('username', 'Alice');
store.remove('username');
store.read('username');  // → undefined
```

---

### removeAll

```typescript
store.removeAll(): void
```

Removes **all entries** belonging to this store (all keys prefixed with `prefix:`). Entries from other stores with a different prefix are not touched.

```typescript
const store = createStorage(schema, { prefix: 'app' });
store.create('username', 'Alice');
store.create('age', 30);
store.removeAll();

store.read('username');  // → undefined
store.read('age');       // → undefined
```

---

### readAll

```typescript
store.readAll(): Partial<Schema>
```

Reads all keys in the schema and returns them as a partial object. Keys that were never written have value `undefined`.

```typescript
store.create('username', 'Alice');
store.create('age', 30);

const data = store.readAll();
// → { username: 'Alice', age: 30, theme: undefined, rememberMe: undefined, sessionToken: undefined }
```

> **Note:** All schema keys appear in the returned object (including unwritten ones as `undefined`). Use `store.read(key) !== undefined` to test if a specific key has been written.

---

### watch

```typescript
store.watch(
  name: K,
  callback: (current: Schema[K] | undefined, previous: Schema[K] | undefined) => void
): () => void
```

Subscribes to changes on a key. The callback fires:

- **Same-tab changes:** synchronously after every `create`, `update`, or `remove` call
- **Cross-tab changes:** asynchronously via the browser's native `storage` event when another tab modifies the key

Returns an **unsubscribe function** — call it to stop watching.

```typescript
const unsubscribe = store.watch('username', (current, previous) => {
  console.log(`username: ${previous} → ${current}`);
});

store.create('username', 'Alice');  // fires: "username: undefined → Alice"
store.update('username', 'Bob');    // fires: "username: Alice → Bob"
store.remove('username');           // fires: "username: Bob → undefined"

unsubscribe();  // stop watching
store.create('username', 'Charlie');  // nothing fires
```

**Multiple watchers on the same key:**

```typescript
const unsub1 = store.watch('theme', (c) => console.log('watcher 1:', c));
const unsub2 = store.watch('theme', (c) => console.log('watcher 2:', c));

store.create('theme', 'dark');
// → "watcher 1: dark"
// → "watcher 2: dark"

unsub1();  // only watcher 1 stops
store.update('theme', 'light');
// → "watcher 2: light"
```

**Cross-tab watching:**

The browser's `storage` event notifies *other* tabs — not the originating tab. km-storage handles this automatically: a single shared `window.addEventListener('storage', ...)` is attached lazily when the first watcher is registered and removed when the last watcher is unsubscribed.

```typescript
// Tab A
const store = createStorage(schema, { prefix: 'shared' });
store.watch('username', (current) => {
  console.log('Cross-tab update received:', current);
});

// Tab B — changes made here fire the callback in Tab A
const storeB = createStorage(schema, { prefix: 'shared' });
storeB.create('username', 'Alice');
```

---

### destroy

```typescript
store.destroy(): void
```

Removes all registered watchers and detaches the cross-tab `storage` event listener. Call this when the component or context owning the store is unmounted or disposed.

```typescript
// React
useEffect(() => {
  const unsub = store.watch('theme', handler);
  return () => store.destroy(); // cleanup on unmount
}, []);
```

---

## Options Reference

### StorageOptions

Passed as the second argument to `createStorage`.

```typescript
type StorageOptions<NAME extends string = string> = {
  prefix?: NAME;
  mode?: StorageMode;
  compress?: boolean;
};
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `'km'` | Namespace prefix prepended to every storage key: `prefix:keyName`. Use a unique prefix per store to avoid key collisions between stores. |
| `mode` | `'localStorage' \| 'sessionStorage'` | `'localStorage'` | Which Web Storage API to use. `sessionStorage` is cleared when the tab is closed. |
| `compress` | `boolean` | `false` | When `true`, values are compressed with [zipson](https://github.com/jgranstrom/zipson) before storage. Useful for large objects. **Do not change this flag after writing entries** — reads will fail silently if the flag does not match the encoding used at write time. |

---

### CreateOptions (TTL)

Passed as the optional third argument to `create` and `update`.

```typescript
type CreateOptions = {
  ttl?: number;  // milliseconds
};
```

| Option | Type | Description |
|--------|------|-------------|
| `ttl` | `number` | Time-to-live in milliseconds. The entry is automatically removed the next time it is read after the TTL has elapsed. Omitting `ttl` (or passing `undefined`) means the entry never expires. |

```typescript
// Entry expires in 5 minutes
store.create('tempCode', 'XK-99', { ttl: 5 * 60 * 1000 });

// After 5 minutes:
store.read('tempCode');  // → undefined (expired entry auto-removed from storage)
```

---

## zodCast — Standalone Zod Coercion Utility

`zodCast` is a **standalone utility** exported from km-storage. It converts an unknown raw value — a string from a URL parameter, an environment variable, a form input, or any untyped source — into the correct JavaScript type described by a Zod schema.

`zodCast` has **no dependency on km-storage internals** and can be used independently in any project that works with Zod.

```typescript
import { zodCast } from 'km-storage';
import { z } from 'zod';

zodCast(z.number(), '42')                              // → 42  (number)
zodCast(z.boolean(), 'true')                           // → true
zodCast(z.boolean(), 'false')                          // → false
zodCast(z.string(), 100)                               // → '100'
zodCast(z.number(), 'not-a-number')                    // → undefined
zodCast(z.object({ x: z.number() }), '{"x":1}')       // → { x: 1 }
zodCast(z.array(z.number()), '[1,2,3]')                // → [1, 2, 3]
zodCast(z.optional(z.string()), null)                   // → undefined
zodCast(z.nullable(z.string()), null)                   // → null
zodCast(z.string().default('fallback'), null)           // → 'fallback'
zodCast(z.string().transform((s) => s.toUpperCase()), 'hello') // → 'HELLO'
```

### zodCast — Function Signature

```typescript
function zodCast<T extends z.ZodTypeAny>(schema: T, raw: unknown): T['_zod']['output'] | undefined
```

Returns `z.infer<T>` if the value can be coerced to the schema's type, or `undefined` if coercion fails.

### zodCast — Supported Schema Types

| Zod Schema | Raw input example | Cast result |
|------------|------------------|-------------|
| `z.string()` | `42`, `true`, `'hello'` | `'42'`, `'true'`, `'hello'` |
| `z.number()` | `'3.14'`, `'-7'`, `42` | `3.14`, `-7`, `42` |
| `z.boolean()` | `'true'`, `'false'`, `true` | `true`, `false`, `true` |
| `z.bigint()` | `'9007199254740993'`, `42n` | `9007199254740993n`, `42n` |
| `z.date()` | `'2024-01-15'`, `1705276800000` | `Date`, `Date` |
| `z.null()` | `null`, `'null'` | `null`, `null` |
| `z.undefined()` | `undefined` | `undefined` |
| `z.nan()` | `NaN`, `'NaN'` | `NaN`, `NaN` |
| `z.literal(42)` | `'42'`, `42` | `42`, `42` |
| `z.enum(['a','b','c'])` | `'a'` | `'a'` |
| `z.nativeEnum(MyEnum)` | `'UP'`, `0` | `'UP'`, `0` |
| `z.object({ x: z.number() })` | `'{"x":1}'`, `{ x: 1 }` | `{ x: 1 }` |
| `z.array(z.number())` | `'[1,2,3]'`, `[1,2,3]` | `[1, 2, 3]` |
| `z.tuple([z.string(), z.number()])` | `'["a",1]'` | `['a', 1]` |
| `z.record(z.string(), z.number())` | `'{"k":1}'` | `{ k: 1 }` |
| `z.set(z.string())` | `['a','b']`, `'["a","b"]'` | `Set {'a','b'}` |
| `z.map(z.string(), z.number())` | `[['a',1]]` | `Map { 'a' => 1 }` |
| `z.union([z.string(), z.number()])` | `42`, `'hello'` | `42`, `'hello'` |
| `z.discriminatedUnion('type', […])` | `{ type: 'a', … }` | matched variant |
| `z.optional(z.string())` | `null`, `undefined` | `undefined` |
| `z.nullable(z.string())` | `null`, `'null'` | `null` |
| `z.string().default('fallback')` | `null`, `undefined` | `'fallback'` |
| `z.number().catch(0)` | `'not-a-number'` | `0` |
| `z.string().transform(fn)` | `'hello'` | `fn('hello')` |
| `z.string().pipe(z.coerce.number())` | `'42'` | `42` |
| `z.any()` / `z.unknown()` | any | parsed JSON if string, else as-is |

### zodCast — Common Use Cases

```typescript
import { zodCast } from 'km-storage';
import { z } from 'zod';

// URL search parameters
const page = zodCast(z.number().min(1).default(1), new URLSearchParams(location.search).get('page'));
// '3' → 3 | null → 1 (default)

// Environment variables
const isDebug = zodCast(z.boolean(), process.env.DEBUG);
// 'true' → true | undefined → undefined

// Form inputs
const choice = zodCast(z.enum(['a', 'b', 'c']), formData.get('choice'));
// 'b' → 'b' | 'invalid' → undefined

// API response fields that might be mistyped
const count = zodCast(z.number(), apiResponse.count);
// '42' → 42 | null → undefined
```

---

## Serialization Utilities

km-storage exports its internal serialization helpers for low-level use cases.

### encodeEntry

```typescript
function encodeEntry(value: unknown, opts?: { ttl?: number; compress?: boolean }): string
```

Wraps a value in an envelope and serializes it to a string suitable for `storage.setItem()`.

```typescript
import { encodeEntry } from 'km-storage';

encodeEntry(42);
// → '{"v":42}'

encodeEntry('hello', { ttl: 5000 });
// → '{"v":"hello","e":1718000000000}'

encodeEntry({ x: 1 }, { compress: true });
// → zipson-compressed string
```

### decodeEntry

```typescript
function decodeEntry(raw: string, opts?: { compress?: boolean }): { value: unknown; expired: boolean } | null
```

Deserializes a raw storage string back to its envelope. Returns `null` if the string is not a valid envelope (e.g. plain text, legacy data).

```typescript
import { decodeEntry } from 'km-storage';

decodeEntry('{"v":42}');
// → { value: 42, expired: false }

decodeEntry('{"v":"hello","e":1000}');  // timestamp in the past
// → { value: 'hello', expired: true }

decodeEntry('plain-string');
// → null
```

### isPlainObject

```typescript
function isPlainObject(value: unknown): value is Record<string, unknown>
```

Returns `true` for plain `{}` objects. Returns `false` for arrays, class instances (`Date`, `Map`, `Set`), `null`, and primitives.

```typescript
import { isPlainObject } from 'km-storage';

isPlainObject({})                   // → true
isPlainObject({ a: 1 })             // → true
isPlainObject(Object.create(null))  // → true
isPlainObject([])                   // → false
isPlainObject(new Date())           // → false
isPlainObject(null)                 // → false
isPlainObject(42)                   // → false
```

### isJsonString

```typescript
function isJsonString(value: unknown): boolean
```

Returns `true` when `value` is a string whose top-level structure is a JSON object `{}` or array `[]`.

```typescript
import { isJsonString } from 'km-storage';

isJsonString('{"a":1}')   // → true
isJsonString('[1,2,3]')   // → true
isJsonString('hello')     // → false
isJsonString('42')        // → false  (valid JSON but not object/array)
isJsonString('true')      // → false
isJsonString(42)          // → false  (not a string)
```

---

## TypeScript Types

All important types are exported from km-storage and can be imported separately:

```typescript
import type {
  StorageMode,
  StorageOptions,
  CreateOptions,
  WatchCallback,
  Updater,
  StorageInstance,
} from 'km-storage';
```

### StorageMode

```typescript
type StorageMode = 'localStorage' | 'sessionStorage';
```

### StorageOptions

```typescript
type StorageOptions<NAME extends string = string> = {
  prefix?: NAME;
  mode?: StorageMode;
  compress?: boolean;
};
```

### CreateOptions

```typescript
type CreateOptions = {
  /** Time-to-live in milliseconds. Entry is auto-removed on next read after expiry. */
  ttl?: number;
};
```

### WatchCallback

```typescript
type WatchCallback<T> = (
  current: T | undefined,
  previous: T | undefined
) => void;
```

### Updater

```typescript
/** A plain value or a function that derives the next value from the current one. */
type Updater<T> = T | ((current: T | undefined) => T);
```

### StorageInstance

```typescript
type StorageInstance<S extends Record<string, unknown>> = {
  create<K extends keyof S>(name: K, value: S[K], options?: CreateOptions): void;
  read<K extends keyof S>(name: K): S[K] | undefined;
  update<K extends keyof S>(name: K, value: Updater<S[K]>, options?: CreateOptions): void;
  remove<K extends keyof S>(name: K): void;
  removeAll(): void;
  readAll(): Partial<S>;
  watch<K extends keyof S>(name: K, callback: WatchCallback<S[K]>): () => void;
  destroy(): void;
};
```

`S` is the **inferred output shape** of your Zod schema — equivalent to `z.infer<typeof schema>`. When you call `createStorage(schema)`, TypeScript resolves `S` automatically from the schema you pass. You can also use the type directly:

```typescript
import type { StorageInstance } from 'km-storage';
import { z } from 'zod';

const schema = z.object({ name: z.string(), age: z.number() });
type MyStore = StorageInstance<z.infer<typeof schema>>;
// → StorageInstance<{ name: string; age: number }>
```

---

## Advanced Usage

### sessionStorage Mode

```typescript
const sessionStore = createStorage(schema, {
  prefix: 'session',
  mode: 'sessionStorage',
});

sessionStore.create('token', 'abc123');
// Stored in sessionStorage — cleared automatically when the tab is closed
```

### Compression

For schemas that store large objects or arrays, enable zipson compression:

```typescript
const store = createStorage(
  z.object({
    catalog: z.array(z.object({ id: z.number(), name: z.string(), tags: z.array(z.string()) })),
  }),
  { prefix: 'data', compress: true }
);

// Values are compressed on write and decompressed on read transparently
store.create('catalog', largeArray);
```

> **Warning:** The `compress` flag must remain the same for all reads and writes on the same store instance. Do not change this flag after writing entries — existing data will become silently unreadable.

### Namespaced / Prefixed Stores

Use different prefixes to create fully isolated stores for different concerns in your application:

```typescript
const authStore = createStorage(
  z.object({
    token: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
  }),
  { prefix: 'auth' }
);

const uiStore = createStorage(
  z.object({
    theme: z.enum(['light', 'dark']).default('light'),
    sidebarOpen: z.boolean().default(true),
    fontSize: z.number().default(14),
  }),
  { prefix: 'ui' }
);

// localStorage keys produced:
// auth:token, auth:refreshToken, auth:expiresAt
// ui:theme, ui:sidebarOpen, ui:fontSize
// — completely isolated, no collision
```

### React — Watching Storage Changes

```tsx
import { useEffect, useState } from 'react';
import { createStorage } from 'km-storage';
import { z } from 'zod';

const schema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  username: z.string(),
});

// Create the store once, outside the component
const store = createStorage(schema, { prefix: 'app' });

// Custom hook that stays in sync with a storage key
function useStorageValue<K extends keyof z.infer<typeof schema>>(key: K) {
  const [value, setValue] = useState(() => store.read(key));

  useEffect(() => {
    // Re-sync with current value (might have changed since initial render)
    setValue(store.read(key));
    const unsubscribe = store.watch(key, (current) => setValue(current));
    return unsubscribe;
  }, [key]);

  return value;
}

function ThemeToggle() {
  const theme = useStorageValue('theme');

  const toggle = () =>
    store.update('theme', (prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <button onClick={toggle}>
      Current theme: {theme ?? 'light'}
    </button>
  );
}
```

### Multiple Stores with Shared Schema

```typescript
const schema = z.object({
  count: z.number().default(0),
  label: z.string(),
});

// One schema, two storage backends
const persistent = createStorage(schema, { prefix: 'counter-ls', mode: 'localStorage' });
const temporary   = createStorage(schema, { prefix: 'counter-ss', mode: 'sessionStorage' });

persistent.create('count', 100);
temporary.create('count', 5);

persistent.read('count');  // → 100
temporary.read('count');   // → 5
```

### TTL Patterns

```typescript
const store = createStorage(
  z.object({
    accessToken: z.string(),
    cachedSearch: z.array(z.object({ id: z.number(), title: z.string() })),
    oneTimeCode: z.string(),
  }),
  { prefix: 'api' }
);

// Access token valid for 15 minutes
store.create('accessToken', 'Bearer tok_xyz', { ttl: 15 * 60 * 1000 });

// Cache search results for 5 minutes
store.create('cachedSearch', results, { ttl: 5 * 60 * 1000 });

// One-time code expires in 30 seconds
store.create('oneTimeCode', 'XK-99', { ttl: 30_000 });

// On each user action, extend the session
store.update('accessToken', (prev) => prev ?? 'Bearer tok_xyz', { ttl: 15 * 60 * 1000 });

// Reads auto-clear expired entries from storage
const token = store.read('accessToken');
if (!token) {
  // Token expired — refresh it
  await refreshToken();
}
```

---

## Export Styles

km-storage supports three import styles — use whichever fits your codebase:

### Named exports (recommended)

```typescript
import { createStorage, zodCast, encodeEntry, decodeEntry, isPlainObject, isJsonString } from 'km-storage';
import type { StorageOptions, StorageInstance, CreateOptions, WatchCallback, Updater } from 'km-storage';
```

### Default namespace export

```typescript
import kmStorage from 'km-storage';

const store = kmStorage.createStorage(schema, { prefix: 'app' });
```

### CommonJS

```javascript
const { createStorage } = require('km-storage');
// or via the default export
const kmStorage = require('km-storage');
const store = kmStorage.default.createStorage(schema, { prefix: 'app' });
```

---

## Version Compatibility

| km-storage | TypeScript | Zod | Node.js |
|------------|-----------|-----|---------|
| `0.3.x` | `4.9.x` | `^3.23` | `>=10` |
| `1.3.x` | `~5.9` | `>=4.0.0` | `>=14` |

---

## Browser Compatibility

km-storage uses the standard Web Storage API (`localStorage`, `sessionStorage`) and the `storage` event — available in all evergreen browsers.

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 4+ |
| Firefox | 3.5+ |
| Safari | 4+ |
| Edge | 12+ |
| Opera | 10.5+ |

> **Note:** km-storage is **SSR-safe** as of `v1.3.5`. `createStorage` can be called unconditionally in SSR frameworks (Next.js, Nuxt, SvelteKit). All operations are no-ops on the server — reads return `undefined`, writes are silently skipped — so your app never crashes on the server and hydrates normally in the browser.

---

## FAQ

**Q: Why Zod 4.x and not 3.x?**

Zod 4 has a significantly smaller bundle size, faster parse times, and a cleaner internal API. km-storage's `zodCast` uses Zod's internal `_def.type` discriminator which changed between v3 (`ZodString`, `ZodNumber` …) and v4 (`'string'`, `'number'` …). Zod 4.x (`^4.4.0`) is required.

---

**Q: What happens if my schema changes after data is already stored?**

When a schema field changes type (e.g. `z.string()` → `z.number()`), `read` tries to coerce the old stored value to the new type via `zodCast`. If coercion fails, it returns `undefined`. No data is overwritten. You can migrate by calling `create` with the corrected value.

---

**Q: Can I store `null`, `false`, or `0` values?**

Yes. km-storage uses an envelope pattern `{"v": value}`, so falsy primitives (`0`, `false`, `null`, `""`) are stored and retrieved correctly without being confused with "missing data". Only `undefined` and a missing key indicate that no data was written.

---

**Q: Is the data encrypted?**

No. km-storage does not encrypt data. `localStorage` and `sessionStorage` are accessible to any JavaScript running on the same origin. Do not store sensitive secrets (passwords, private keys, PII) in Web Storage.

---

**Q: Does `watch()` fire for changes in the same tab?**

Yes. km-storage calls `notify()` synchronously after every `create`, `update`, and `remove` call, so same-tab watchers always fire immediately. Cross-tab watchers use the browser's `storage` event, which fires in other tabs — not the originating one.

---

**Q: What is the storage size limit?**

`localStorage` is limited to approximately 5 MB per origin (varies by browser). With `compress: true`, payloads are typically 30–70% smaller. For very large data sets, consider IndexedDB.

---

**Q: What is `zodCast` useful for outside of km-storage?**

`zodCast` is useful wherever you receive untyped string or unknown data and need to convert it to a typed value with a Zod schema:

- **URL parameters:** `zodCast(z.number().min(1), searchParams.get('page'))` — `'3'` → `3`
- **Environment variables:** `zodCast(z.boolean(), process.env.DEBUG)` — `'true'` → `true`
- **Form fields:** `zodCast(z.enum(['asc','desc']), formData.get('sort'))` — `'asc'` → `'asc'`
- **API response coercion:** when a backend returns `"42"` where you expect `42`

---

**Q: Can I use km-storage without TypeScript?**

Yes. The compiled package ships as plain JavaScript (ESM, CJS, and Universal builds). You lose type safety and intellisense, but the runtime behavior is identical.

---

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/komeilm76/km-storage/issues).

```bash
# Clone and install
git clone https://github.com/komeilm76/km-storage.git
cd km-storage
bun install

# Run tests
bun run test

# Run tests with coverage report
bun run test:coverage

# Build all output formats
bun run build
```

---

## License

[MIT](./LICENSE) — free to use, modify, and distribute.

---

<p align="center">Made with care by <a href="https://github.com/komeilm76">komeilm76</a></p>
