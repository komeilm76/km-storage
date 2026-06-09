import type { z } from 'zod';
import { zodCast } from './zod-cast';

/**
 * Minimal structural shape of a Zod object schema.
 * Used instead of `z.ZodObject<any>` in exported signatures so that TypeScript
 * Language Server does not need to load Zod's type system to resolve km-storage types.
 * Every `z.ZodObject` satisfies this interface via its `_zod.output` and `shape` fields.
 */
type $AnyZodObject = {
  readonly _zod: { readonly output: Record<string, unknown> };
  shape: Record<string, unknown>;
};
import { encodeEntry, decodeEntry } from './serialize';
import type {
  StorageOptions,
  CreateOptions,
  WatchCallback,
  Updater,
  StorageInstance,
} from './types';

/**
 * Create a fully typed, schema-validated storage instance backed by either
 * `localStorage` or `sessionStorage`.
 *
 * Every key is namespaced under `options.prefix` to avoid collisions with other
 * stores or third-party code. Values are wrapped in an internal envelope so that
 * primitives (`number`, `boolean`, `null`) survive the JSON round-trip without
 * type-coercion hacks — a stored `42` always comes back as the number `42`, not `"42"`.
 *
 * @template SCHEMA - A `z.ZodObject` that defines the keys and value types for this store.
 * @template NAME   - Literal string type for the prefix (inferred from `options.prefix`).
 *
 * @param schema  - A Zod object schema. Each top-level key becomes a storable key with
 *                  full TypeScript inference and runtime validation on every read/write.
 * @param options - Optional configuration. See {@link StorageOptions} for all fields.
 *
 * @returns A {@link StorageInstance} bound to the given schema and options.
 *
 * @example
 * import { createStorage } from 'km-storage';
 * import { z } from 'zod';
 *
 * const store = createStorage(
 *   z.object({
 *     token: z.string(),
 *     userId: z.number(),
 *     darkMode: z.boolean().default(false),
 *   }),
 *   { prefix: 'myapp' }
 * );
 *
 * store.create('token', 'abc123');
 * store.read('token');                            // → 'abc123'
 * store.update('darkMode', (prev) => !prev);
 * store.watch('token', (cur, prev) => console.log(cur, prev));
 */
export function createStorage<SCHEMA extends $AnyZodObject, NAME extends string = string>(
  schema: SCHEMA,
  options?: StorageOptions<NAME>
): StorageInstance<SCHEMA['_zod']['output']> {
  type S = SCHEMA['_zod']['output'];

  /**
   * The storage backend — either `'localStorage'` or `'sessionStorage'`.
   *
   * @default 'localStorage'
   */
  const mode = options?.mode ?? 'localStorage';

  /**
   * Namespace prefix prepended to every storage key as `"prefix:keyName"`.
   *
   * @default 'km'
   */
  const prefix = (options?.prefix ?? 'km') as NAME;

  /**
   * Whether to compress serialized values with zipson.
   *
   * @default false
   */
  const compress = options?.compress ?? false;

  // ── SSR / non-browser guard ───────────────────────────────────────────────

  /** True when running inside a real browser with Web Storage available. */
  const isBrowser = typeof window !== 'undefined';

  // ── Storage accessor ──────────────────────────────────────────────────────

  /**
   * Returns the active `Storage` object (`localStorage` or `sessionStorage`),
   * or `null` when called outside a browser (SSR, Node.js, Deno, test runners
   * that do not provide a `window` global). Callers treat `null` as a no-op so
   * the library is safe to import and call unconditionally in SSR frameworks
   * such as Next.js, Nuxt, and SvelteKit.
   *
   * @returns The `Storage` object for the current mode, or `null` in non-browser environments.
   *
   * @example
   * getStore()?.setItem('key', 'value'); // writes to localStorage or sessionStorage (browser only)
   */
  const getStore = (): Storage | null => {
    if (!isBrowser) return null;
    return mode === 'localStorage' ? window.localStorage : window.sessionStorage;
  };

  // ── Key helpers ───────────────────────────────────────────────────────────

  /**
   * Build the namespaced storage key for a schema field name.
   *
   * @param name - A raw field name from the schema (e.g. `'username'`).
   * @returns    The full storage key (e.g. `'km:username'`).
   *
   * @example
   * toKey('username') // → 'km:username'
   */
  const toKey = (name: string): string => `${prefix}:${name}`;

  /**
   * Strip the prefix from a full storage key to recover the bare field name.
   *
   * @param key - A namespaced storage key (e.g. `'km:username'`).
   * @returns   The bare field name (e.g. `'username'`).
   *
   * @example
   * fromKey('km:username') // → 'username'
   */
  const fromKey = (key: string): string => key.slice(`${prefix}:`.length);

  // ── Watcher registry ──────────────────────────────────────────────────────

  /**
   * Registry of active watch subscriptions.
   *
   * Maps each schema field name to the set of callbacks currently subscribed to it.
   * A field is only present in the map while it has at least one active subscriber.
   * The cross-tab `storage` event listener is lazily attached when the first entry
   * is added and removed when the map becomes empty again.
   */
  const watchers = new Map<string, Set<WatchCallback<unknown>>>();

  /**
   * Fire all registered callbacks for a given field, passing the new and previous values.
   *
   * Called synchronously after every successful `create`, `update`, or `remove` call,
   * and also from `handleStorageEvent` for cross-tab updates.
   *
   * @param name     - The bare field name (not the namespaced key).
   * @param current  - The new value (or `undefined` if the entry was removed).
   * @param previous - The value before the change (or `undefined` if it was absent).
   *
   * @example
   * notify('username', 'Bob', 'Alice'); // fires all watchers for 'username'
   */
  const notify = (name: string, current: unknown, previous: unknown): void => {
    watchers.get(name)?.forEach((cb) => cb(current, previous));
  };

  // ── Cross-tab: storage event ───────────────────────────────────────────────

  /**
   * Handler for the browser's native `storage` event.
   *
   * The `storage` event fires in all browser tabs **other** than the one that made
   * the change. This handler filters the event to only process keys that:
   * 1. Are non-null (guards against `localStorage.clear()` which emits `key: null`)
   * 2. Start with the store's prefix (ignores unrelated stores or third-party code)
   * 3. Correspond to a key actually defined in the schema
   *
   * When the event passes all filters, it reads the current value from storage and
   * calls `notify` so that all registered watchers receive the update.
   *
   * @param event - The native `StorageEvent` dispatched by the browser.
   */
  const handleStorageEvent = (event: StorageEvent): void => {
    if (event.key === null || !event.key.startsWith(`${prefix}:`)) return;

    const name = fromKey(event.key);
    if (!(name in schema.shape)) return;

    const current = readValue(name as keyof S);
    const previous =
      event.oldValue !== null ? tryDecode(name as keyof S, event.oldValue) : undefined;

    notify(name, current, previous);
  };

  // ── Internal read helpers ─────────────────────────────────────────────────

  /**
   * Decode and schema-cast a raw storage string that is already in memory.
   *
   * Used when the raw string is already available (e.g. from a `StorageEvent.oldValue`)
   * to avoid an extra `getItem` call. Does not touch live storage.
   *
   * @param name - The schema field key (used to look up the Zod field schema).
   * @param raw  - The raw serialized string (as returned by `getItem`).
   * @returns    The typed value, or `undefined` if decoding or validation fails,
   *             or the entry is expired.
   *
   * @example
   * tryDecode('age', '{"v":30}')        // → 30
   * tryDecode('age', '{"v":30,"e":1}')  // → undefined (expired)
   * tryDecode('age', 'invalid')          // → undefined
   */
  const tryDecode = <K extends keyof S>(name: K, raw: string): S[K] | undefined => {
    const decoded = decodeEntry(raw, { compress });
    if (!decoded || decoded.expired) return undefined;
    const fieldSchema = schema.shape[name as string] as z.ZodTypeAny;
    return zodCast(fieldSchema, decoded.value) as S[K] | undefined;
  };

  /**
   * Read, decode, and schema-cast the current stored value for a field.
   *
   * This is the single path through which all reads flow:
   * 1. Fetches the raw string from `getStore().getItem(toKey(name))`
   * 2. Returns `undefined` for missing or malformed entries
   * 3. Auto-removes the entry from storage and returns `undefined` if it has expired
   * 4. Coerces the decoded value to the field's schema type via `zodCast`
   *
   * @param name - The schema field key.
   * @returns    The typed value, or `undefined` on any failure or expiry.
   *
   * @example
   * store.create('age', 30);
   * readValue('age') // → 30
   * readValue('username') // → undefined (never written)
   */
  const readValue = <K extends keyof S>(name: K): S[K] | undefined => {
    const store = getStore();
    if (!store) return undefined;

    const raw = store.getItem(toKey(name as string));
    if (raw === null) return undefined;

    const decoded = decodeEntry(raw, { compress });
    if (!decoded) return undefined;

    if (decoded.expired) {
      store.removeItem(toKey(name as string));
      return undefined;
    }

    const fieldSchema = schema.shape[name as string] as z.ZodTypeAny;
    return zodCast(fieldSchema, decoded.value) as S[K] | undefined;
  };

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Validate and write a value to storage for the given schema key.
   *
   * The value is validated with `schema.shape[name].safeParse(value)` before any
   * write occurs. If validation fails, a `ZodError` is thrown and storage is not
   * modified. After a successful write, all watchers registered for the key are
   * notified synchronously with `(newValue, previousValue)`.
   *
   * @param name  - A key defined in the schema.
   * @param value - The value to store. Must satisfy the schema field type for `name`.
   * @param opts  - Optional per-entry settings (e.g., `ttl` in milliseconds).
   *
   * @throws {ZodError} When `value` does not pass schema validation for `name`.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30, { ttl: 60_000 }); // expires in 60 s
   * store.create('age', 'not-a-number');        // throws ZodError
   */
  const create = <K extends keyof S>(name: K, value: S[K], opts?: CreateOptions): void => {
    const fieldSchema = schema.shape[name as string] as z.ZodTypeAny;
    const parsed = fieldSchema.safeParse(value);
    if (!parsed.success) throw parsed.error;

    const store = getStore();
    if (!store) return;
    const previous = readValue(name);
    const encoded = encodeEntry(parsed.data, { ttl: opts?.ttl, compress });
    store.setItem(toKey(name as string), encoded);
    notify(name as string, parsed.data, previous);
  };

  /**
   * Read and return the current value for a schema key.
   *
   * Returns `undefined` when:
   * - the key has never been written
   * - the stored envelope is malformed or in an incompatible format
   * - the entry's TTL has elapsed (the entry is **auto-removed** on this call)
   *
   * @param name - A key defined in the schema.
   * @returns    The stored value coerced to its schema type, or `undefined`.
   *
   * @example
   * store.create('age', 30);
   * store.read('age');       // → 30  (typed as number)
   * store.read('username');  // → undefined  (never written)
   */
  const read = <K extends keyof S>(name: K): S[K] | undefined => readValue(name);

  /**
   * Update an existing entry. Accepts a plain value or a function that receives
   * the current value and returns the next value (functional update pattern).
   *
   * Internally delegates to {@link create}, so validation and watcher notification
   * apply in the same way. Throws `ZodError` if the resulting value is invalid.
   *
   * @param name  - A key defined in the schema.
   * @param value - A plain replacement value, or `(current) => next`.
   * @param opts  - Optional per-entry settings (e.g., `ttl` in milliseconds).
   *
   * @throws {ZodError} When the resulting value does not satisfy the schema.
   *
   * @example
   * store.create('count', 10);
   * store.update('count', 20);                        // plain value → 20
   * store.update('count', (prev) => (prev ?? 0) + 1); // functional → 21
   *
   * // Works even when the key has never been written (prev is undefined)
   * store.update('count', (prev) => prev ?? 0); // → 0
   *
   * // Reset TTL on each user action
   * store.update('sessionToken', (t) => t ?? 'tok', { ttl: 30_000 });
   */
  const update = <K extends keyof S>(name: K, value: Updater<S[K]>, opts?: CreateOptions): void => {
    const current = readValue(name);
    const next =
      typeof value === 'function' ? (value as (prev: S[K] | undefined) => S[K])(current) : value;
    create(name, next, opts);
  };

  /**
   * Remove the entry for the given key from storage.
   *
   * Safe to call even if the key was never written (no-op in that case).
   * After removal, all watchers for the key are notified synchronously
   * with `(undefined, previousValue)`.
   *
   * @param name - A key defined in the schema.
   *
   * @example
   * store.create('username', 'Alice');
   * store.remove('username');
   * store.read('username'); // → undefined
   *
   * store.remove('neverWritten'); // no-op, no error
   */
  const remove = <K extends keyof S>(name: K): void => {
    const store = getStore();
    if (!store) return;
    const previous = readValue(name);
    store.removeItem(toKey(name as string));
    notify(name as string, undefined, previous);
  };

  /**
   * Remove all entries belonging to this store instance.
   *
   * Iterates over every key in the schema and calls {@link remove} for each,
   * so all watchers are notified and the logic stays consistent. Entries from
   * other stores (different prefix) or unrelated code are not affected.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30);
   * store.removeAll();
   * store.read('username'); // → undefined
   * store.read('age');      // → undefined
   */
  const removeAll = (): void => {
    for (const key of Object.keys(schema.shape)) {
      remove(key as keyof S);
    }
  };

  /**
   * Read all schema keys and return them as a partial object.
   *
   * Every key defined in the schema is read via {@link readValue}. Keys that have
   * never been written, or whose entries have expired, appear as `undefined`.
   *
   * @returns A `Partial<z.infer<SCHEMA>>` object containing every schema key.
   *
   * @example
   * store.create('username', 'Alice');
   * store.create('age', 30);
   * store.readAll();
   * // → { username: 'Alice', age: 30, active: undefined, score: undefined, tags: undefined }
   */
  const readAll = (): Partial<S> => {
    const result: Partial<S> = {};
    for (const key of Object.keys(schema.shape)) {
      const k = key as keyof S;
      result[k] = readValue(k);
    }
    return result;
  };

  /**
   * Subscribe to value changes on a key (same-tab writes and cross-tab `storage` events).
   *
   * - **Same-tab:** the callback fires synchronously after every `create`, `update`, or `remove`.
   * - **Cross-tab:** the callback fires when another browser tab changes the key. A single
   *   shared `window.addEventListener('storage', …)` is attached lazily when the first
   *   watcher is registered and removed when the last watcher is cancelled.
   *
   * @param name     - A key defined in the schema.
   * @param callback - Invoked with `(current, previous)` on every detected change.
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
  const watch = <K extends keyof S>(name: K, callback: WatchCallback<S[K]>): (() => void) => {
    const nameStr = name as string;
    if (!watchers.has(nameStr)) {
      watchers.set(nameStr, new Set());
    }
    const set = watchers.get(nameStr)!;
    set.add(callback as WatchCallback<unknown>);

    if (isBrowser && watchers.size === 1) {
      window.addEventListener('storage', handleStorageEvent);
    }

    return () => {
      set.delete(callback as WatchCallback<unknown>);
      if (set.size === 0) watchers.delete(nameStr);
      if (isBrowser && watchers.size === 0)
        window.removeEventListener('storage', handleStorageEvent);
    };
  };

  /**
   * Remove all registered watchers and detach the cross-tab `storage` event listener.
   *
   * Call this when the component or module that owns the store is unmounted or
   * disposed to prevent memory leaks and stale callbacks.
   *
   * @example
   * // React — clean up on component unmount
   * useEffect(() => {
   *   const unsub = store.watch('theme', handler);
   *   return () => store.destroy();
   * }, []);
   */
  const destroy = (): void => {
    watchers.clear();
    if (isBrowser) window.removeEventListener('storage', handleStorageEvent);
  };

  return { create, read, update, remove, removeAll, readAll, watch, destroy };
}
