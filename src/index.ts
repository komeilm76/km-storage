// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Create a fully typed, schema-validated storage instance.
 *
 * Re-exported from `./storage` as the primary named export of km-storage.
 *
 * @see {@link createStorage} in `./storage` for full documentation.
 *
 * @example
 * import { createStorage } from 'km-storage';
 * import { z } from 'zod';
 *
 * const store = createStorage(
 *   z.object({ username: z.string(), age: z.number() }),
 *   { prefix: 'app' }
 * );
 */
export { createStorage } from './storage';

// ─── Standalone utilities ────────────────────────────────────────────────────

/**
 * Standalone Zod-aware coercion utility.
 *
 * Converts an unknown raw value (URL param, env var, form field, localStorage string)
 * into the correct JavaScript type described by a Zod schema. Has no dependency on
 * km-storage internals and can be used independently.
 *
 * @see {@link zodCast} in `./zod-cast/cast` for full documentation.
 *
 * @example
 * import { zodCast } from 'km-storage';
 * import { z } from 'zod';
 *
 * zodCast(z.number(), '42')   // → 42
 * zodCast(z.boolean(), 'true') // → true
 */
export { zodCast } from './zod-cast/index';

/**
 * Low-level serialization helpers used internally by km-storage.
 *
 * Exported for advanced use cases where direct access to the envelope format
 * is needed (e.g. custom storage adapters, migration scripts, or debugging).
 *
 * - `encodeEntry` — wraps a value in a typed envelope and serializes to a string
 * - `decodeEntry` — deserializes a raw storage string back to its envelope contents
 * - `isPlainObject` — type guard for plain `{}` objects
 * - `isJsonString` — returns `true` for JSON object/array strings
 *
 * @see `./serialize` for full documentation on each function.
 *
 * @example
 * import { encodeEntry, decodeEntry } from 'km-storage';
 *
 * const raw = encodeEntry(42, { ttl: 5000 });
 * const result = decodeEntry(raw); // → { value: 42, expired: false }
 */
export { encodeEntry, decodeEntry, isPlainObject, isJsonString } from './serialize';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All public TypeScript types exported from km-storage.
 *
 * Import these for use in your own TypeScript types, function signatures, or
 * generic constraints.
 *
 * @example
 * import type {
 *   StorageMode,
 *   StorageOptions,
 *   CreateOptions,
 *   WatchCallback,
 *   Updater,
 *   StorageInstance,
 * } from 'km-storage';
 */
export type {
  StorageMode,
  StorageOptions,
  CreateOptions,
  WatchCallback,
  Updater,
  StorageInstance,
} from './types';

// ─── Default export: kmStorage namespace ─────────────────────────────────────

import { createStorage } from './storage';

/**
 * Default namespace export — allows both usage styles:
 *
 * **Named import (recommended):**
 * ```ts
 * import { createStorage } from 'km-storage';
 * const store = createStorage(schema, opts);
 * ```
 *
 * **Default / namespace import:**
 * ```ts
 * import kmStorage from 'km-storage';
 * const store = kmStorage.createStorage(schema, opts);
 * ```
 *
 * **CommonJS:**
 * ```js
 * const kmStorage = require('km-storage');
 * const store = kmStorage.default.createStorage(schema, opts);
 * ```
 */
const kmStorage = { createStorage };

export default kmStorage;
