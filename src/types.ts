import type { z } from 'zod';

/**
 * The storage backend to target.
 *
 * - `'localStorage'`   — persists across sessions and browser tabs (default)
 * - `'sessionStorage'` — scoped to the current tab; cleared when the tab closes
 *
 * @example
 * const store = createStorage(schema, { mode: 'sessionStorage' });
 */
export type StorageMode = 'localStorage' | 'sessionStorage';

/**
 * Configuration options accepted by {@link createStorage}.
 *
 * All fields are optional. Unspecified fields fall back to their documented defaults.
 *
 * @template NAME - Literal string type for the `prefix` field, enabling stricter typing
 *                  when a specific prefix string is passed.
 *
 * @example
 * // Minimal — uses all defaults ('km' prefix, localStorage, no compression)
 * const store = createStorage(schema);
 *
 * @example
 * // Fully configured
 * const store = createStorage(schema, {
 *   prefix: 'myapp',
 *   mode: 'sessionStorage',
 *   compress: true,
 * });
 */
export type StorageOptions<NAME extends string = string> = {
  /**
   * Namespace prefix prepended to every storage key as `"prefix:keyName"`.
   *
   * Use a unique prefix per store to prevent key collisions between stores or
   * third-party code writing to the same storage.
   *
   * @default 'km'
   *
   * @example
   * // With prefix 'app', a key 'username' is stored as 'app:username'
   * const store = createStorage(schema, { prefix: 'app' });
   * store.create('username', 'Alice');
   * // localStorage key → 'app:username'
   */
  prefix?: NAME;

  /**
   * Which Web Storage API to use for reading and writing entries.
   *
   * - `'localStorage'`   — data persists until explicitly removed (default)
   * - `'sessionStorage'` — data is cleared when the browser tab is closed
   *
   * @default 'localStorage'
   *
   * @example
   * const tempStore = createStorage(schema, { mode: 'sessionStorage' });
   */
  mode?: StorageMode;

  /**
   * When `true`, values are compressed with [zipson](https://github.com/jgranstrom/zipson)
   * before being written to storage. This typically reduces payload size by 30–70% for
   * large objects or arrays, at the cost of a small encode/decode overhead.
   *
   * **Warning:** The `compress` flag must be the same for every read and write on the same
   * store instance. Changing this flag after entries have been written will cause reads to
   * return `undefined` silently, because the stored data is in a different format.
   *
   * @default false
   *
   * @example
   * const compressedStore = createStorage(schema, { compress: true });
   */
  compress?: boolean;
};

/**
 * Per-entry options accepted by {@link StorageInstance.create} and
 * {@link StorageInstance.update}.
 *
 * @example
 * // Entry auto-expires after 5 minutes
 * store.create('sessionToken', 'tok_abc', { ttl: 5 * 60 * 1000 });
 *
 * // Reset TTL on each user action
 * store.update('sessionToken', (prev) => prev ?? 'tok_abc', { ttl: 30_000 });
 */
export type CreateOptions = {
  /**
   * Time-to-live in **milliseconds**.
   *
   * When set to a positive number, the entry is automatically removed from storage
   * the next time it is read after the TTL has elapsed. The expiry timestamp is stored
   * inside the entry envelope so no separate timer or key is needed.
   *
   * Omitting `ttl`, or passing `0` or `undefined`, means the entry never expires.
   *
   * @example
   * { ttl: 60_000 }           // expires in 60 seconds
   * { ttl: 15 * 60 * 1000 }  // expires in 15 minutes
   * { ttl: 24 * 60 * 60 * 1000 } // expires in 1 day
   */
  ttl?: number;
};

/**
 * Callback signature for {@link StorageInstance.watch}.
 *
 * The callback is invoked with two arguments every time the watched key changes:
 * - **same-tab writes:** immediately after `create`, `update`, or `remove`
 * - **cross-tab writes:** asynchronously via the browser's native `storage` event
 *
 * @template T - The type of the watched value, inferred from the Zod schema field.
 *
 * @param current  - The new value after the change, or `undefined` if the entry
 *                   was removed or its TTL expired.
 * @param previous - The value that existed before the change, or `undefined` if
 *                   the entry was absent before the change.
 *
 * @example
 * const handler: WatchCallback<string> = (current, previous) => {
 *   console.log(`username changed from "${previous}" to "${current}"`);
 * };
 * store.watch('username', handler);
 */
export type WatchCallback<T> = (current: T | undefined, previous: T | undefined) => void;

/**
 * A plain value **or** a function that derives the next value from the current stored value.
 *
 * Used by {@link StorageInstance.update} to support the functional updater pattern —
 * identical to React's `useState` setter.
 *
 * When a function is supplied, it receives the current stored value (or `undefined`
 * if the key has not been written yet) and must return the next value.
 *
 * @template T - The schema field type.
 *
 * @example
 * // Plain value replacement
 * const plain: Updater<number> = 42;
 * store.update('count', plain);
 *
 * @example
 * // Functional updater — safe even when the key has never been written
 * const increment: Updater<number> = (current) => (current ?? 0) + 1;
 * store.update('count', increment);
 */
export type Updater<T> = T | ((current: T | undefined) => T);

/**
 * The storage instance returned by {@link createStorage}.
 *
 * All method signatures are fully typed against `SCHEMA`: key names are
 * inferred as a union of the schema's keys, and value types are inferred
 * per key — wrong keys or wrong value types are compile-time errors.
 *
 * @template SCHEMA - A `z.ZodObject` that defines the keys and value types
 *                    for this store.
 *
 * @example
 * import { z } from 'zod';
 * import { createStorage } from 'km-storage';
 * import type { StorageInstance } from 'km-storage';
 *
 * const schema = z.object({ theme: z.string(), count: z.number() });
 * const store: StorageInstance<typeof schema> = createStorage(schema, { prefix: 'app' });
 */
export type StorageInstance<SCHEMA extends z.ZodObject<any>> = {
  /**
   * Validate and write a value to storage. Replaces any existing entry for the same key.
   *
   * The value is validated against the schema field **before** writing. If validation
   * fails, a `ZodError` is thrown and storage is not modified. After a successful write,
   * all registered `watch()` callbacks for the key fire synchronously.
   *
   * @param name    - A key defined in the Zod schema.
   * @param value   - The value to store. Must satisfy the schema field type for `name`.
   * @param options - Optional write settings (e.g., `ttl` in milliseconds).
   *
   * @throws {ZodError} When `value` fails schema validation for `name`.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30, { ttl: 60_000 }); // expires in 60 s
   * store.create('age', 'oops' as any);         // throws ZodError
   */
  create<K extends keyof z.infer<SCHEMA>>(
    name: K,
    value: z.infer<SCHEMA>[K],
    options?: CreateOptions
  ): void;

  /**
   * Read and return the current value for a schema key.
   *
   * Returns `undefined` when:
   * - the key has never been written
   * - the stored envelope is malformed or incompatible with the current schema
   * - the entry's TTL has elapsed (the entry is **auto-removed** on this read)
   *
   * The raw stored string is decoded and coerced back to the correct JavaScript type
   * via `zodCast` — a stored `30` always comes back as the number `30`, never as `"30"`.
   *
   * @param name - A key defined in the Zod schema.
   * @returns    The stored value typed as `Schema[K]`, or `undefined`.
   *
   * @example
   * store.create('age', 30);
   * store.read('age');       // → 30  (number)
   * store.read('username');  // → undefined  (never written)
   */
  read<K extends keyof z.infer<SCHEMA>>(name: K): z.infer<SCHEMA>[K] | undefined;

  /**
   * Update a stored entry. Accepts a **plain value** or a **functional updater**
   * that receives the current value and returns the next value.
   *
   * Internally delegates to `create`, so schema validation and watcher notification
   * apply in the same way. Throws `ZodError` if the resulting value is invalid.
   *
   * @param name    - A key defined in the Zod schema.
   * @param value   - A new value, or `(current: Schema[K] | undefined) => Schema[K]`.
   * @param options - Optional write settings (e.g., `ttl` in milliseconds).
   *
   * @throws {ZodError} When the resulting value fails schema validation.
   *
   * @example
   * store.create('count', 10);
   * store.update('count', 20);                          // plain value → 20
   * store.update('count', (prev) => (prev ?? 0) + 1);  // functional → 21
   *
   * // Safe when key has never been written (prev is undefined)
   * store.update('count', (prev) => prev ?? 0); // → 0
   */
  update<K extends keyof z.infer<SCHEMA>>(
    name: K,
    value: Updater<z.infer<SCHEMA>[K]>,
    options?: CreateOptions
  ): void;

  /**
   * Remove a single entry from storage. Safe to call even if the key was never
   * written (no-op). After removal, all `watch()` callbacks for the key fire
   * synchronously with `(undefined, previousValue)`.
   *
   * @param name - A key defined in the Zod schema.
   *
   * @example
   * store.create('username', 'Alice');
   * store.remove('username');
   * store.read('username'); // → undefined
   *
   * store.remove('neverWritten'); // no-op, no error
   */
  remove<K extends keyof z.infer<SCHEMA>>(name: K): void;

  /**
   * Remove **all** entries that belong to this store instance (every key matching
   * `prefix:*` defined in the schema). Entries from other stores or third-party
   * code using a different prefix are not affected.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30);
   * store.removeAll();
   * store.read('username'); // → undefined
   * store.read('age');      // → undefined
   */
  removeAll(): void;

  /**
   * Read every key in the schema and return the results as a partial object.
   * Keys that were never written (or whose entries have expired) appear as `undefined`.
   *
   * @returns A `Partial<z.infer<SCHEMA>>` containing all schema keys.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30);
   * store.readAll();
   * // → { username: 'Alice', age: 30, active: undefined, score: undefined, tags: undefined }
   */
  readAll(): Partial<z.infer<SCHEMA>>;

  /**
   * Subscribe to value changes on a single schema key.
   *
   * The callback fires:
   * - **Same-tab:** synchronously after every `create`, `update`, or `remove` call.
   * - **Cross-tab:** asynchronously when another browser tab modifies the key, via
   *   the native `storage` event. A single shared listener is lazily attached when
   *   the first watcher is registered and removed when the last watcher unsubscribes.
   *
   * Returns an **unsubscribe function** — call it to stop watching and release resources.
   *
   * @param name     - A key defined in the Zod schema.
   * @param callback - Invoked as `(current, previous)` on every change.
   * @returns        An unsubscribe function. Call it to cancel the subscription.
   *
   * @example
   * const unsub = store.watch('username', (current, previous) => {
   *   console.log(`username: "${previous}" → "${current}"`);
   * });
   *
   * store.create('username', 'Alice'); // fires: 'username: "undefined" → "Alice"'
   * store.update('username', 'Bob');   // fires: 'username: "Alice" → "Bob"'
   * store.remove('username');          // fires: 'username: "Bob" → "undefined"'
   *
   * unsub(); // stop watching
   * store.create('username', 'Charlie'); // nothing fires
   */
  watch<K extends keyof z.infer<SCHEMA>>(
    name: K,
    callback: WatchCallback<z.infer<SCHEMA>[K]>
  ): () => void;

  /**
   * Remove **all** registered watchers and detach the cross-tab `storage` event listener.
   *
   * Call this when the component or module that owns the store is unmounted or disposed
   * to prevent memory leaks and stale callbacks.
   *
   * @example
   * // React — clean up on component unmount
   * useEffect(() => {
   *   const unsub = store.watch('theme', handler);
   *   return () => store.destroy();
   * }, []);
   */
  destroy(): void;
};
