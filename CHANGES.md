# Changelog

## v1.3.4 — 2026-06-09

### Dependencies

- **`zod` promoted to `peerDependency`** — Zod is now declared under `peerDependencies` (previously `dependencies`). Consumers must install Zod themselves alongside km-storage (e.g. `npm install km-storage zod`). This ensures TypeScript resolves `'zod'` from the consumer's own `node_modules/zod/` path, which tsserver has already parsed and cached — eliminating any residual IDE latency from duplicated Zod installations in nested `node_modules`.

---

## v1.3.3 — 2026-06-08

### Bug Fixes

- **Zero Zod imports in generated declaration files** — replaced all remaining Zod type references in exported signatures with local structural types (`$AnyZodObject`, `$AnyZodType`). `grep -rn "^import.*zod" build/` now returns zero results across all `.d.ts` / `.d.mts` outputs, fully eliminating the IDE hang on import.

---

## v1.3.2 — 2026-06-08

### Bug Fixes

- **`StorageInstance` decoupled from Zod internals** — the public `StorageInstance<S>` type now takes the inferred output shape (`S extends Record<string, unknown>`) rather than the raw Zod schema, preventing tsserver from loading Zod's type system when consumers use the type annotation.

---

## v1.3.1 — 2026-06-08

### Bug Fixes

- Prettier formatting pass on `src/types.ts` and `src/zod-cast/cast.ts`.

---

## v1.3.0 — 2026-06-08

### Documentation

- **Full JSDoc coverage** added to every public function, type, variable, and internal
  helper across all source files (`src/types.ts`, `src/storage.ts`, `src/serialize.ts`,
  `src/zod-cast/cast.ts`, `src/index.ts`).
- Every JSDoc block now includes:
  - `@param` — name, type, and description for each parameter
  - `@returns` — what the function returns and when
  - `@example` — one or more concrete usage examples
  - `@default` — for options and variables that have a default value
  - `@throws` — for functions that throw (`ZodError` on validation failure)
  - `@template` — for generic type parameters
- Internal helpers (`getStore`, `toKey`, `fromKey`, `watchers`, `notify`,
  `handleStorageEvent`, `tryDecode`, `readValue`, `schemaType`, `innerType`,
  `tryParseJson`, `asJsonComplex`) are documented with `@internal` tags, explaining
  their role and edge-case behaviour.
- `DecodeResult` type in `serialize.ts` gains full field-level docs explaining
  the `value` and `expired` fields.
- `Envelope` internal type is fully documented with field explanations and a rationale
  comment covering the three guarantees the envelope pattern provides.
- All 30+ Zod schema branches in `zodCast` are individually documented with their
  coercion rules, edge cases, and inline examples.

### Code Quality

- Removed stray test code and an unused import (`string` from `zod/regexes`) from
  `src/index.ts` that were accidentally committed in a previous release.
- Re-export of `encodeEntry`/`decodeEntry`/`isPlainObject`/`isJsonString` from
  `src/index.ts` switched from `'./serialize.js'` to `'./serialize'` for
  consistency with the rest of the codebase.

---

## v0.3.0

- Added `compress` option using zipson for storage compression
- Added `editManualy` option to prevent manual localStorage edits

## v0.2.7

- Internal improvements

## v0.2.6

- `editManualy` option added

## v0.2.0

- Initial public release with Zod schema validation
- Support for `localStorage` and `sessionStorage`
- `create`, `use`, `useAll`, `remove`, `removeAll` API
