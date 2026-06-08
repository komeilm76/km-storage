# Changelog

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
