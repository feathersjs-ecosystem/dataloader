# Change Log

## Unreleased — V1

### Breaking changes

- Make `exec()` private. Use `load()` or `_load()` with `.key()` and `.multi()` for lookups.
- Limit AppLoader and ServiceLoader configuration to `key` and `maxBatchSize`; remove other DataLoader options.
- Remove service-loader `get`, `_get`, `find`, and `_find` methods. Use `load`/`_load` for relationship lookups or call the Feathers service directly.
- Make `multi()` take no arguments. Use `.key(key).multi()` to select a relationship field.
- Remove custom `cacheMap`, `cacheParamsFn`, and AppLoader base-class configuration, and the old cache-params types/default function exports.
- Normalize all params recursively for cache identity, preserving primitive distinctions and reference identity for callbacks and opaque objects.
- Reject `$limit`, `$skip`, and `$sort` query filters in both load methods. `$limit` is no longer silently removed.
- Make cache clearing synchronous. AppLoader retains service loaders when clearing their cached results.
- Remove the instance `stringifyKey` helper and service-path prefixes from internal cache keys.

### Fixes and improvements

- Add a default `key` setting globally, per service, or on direct ServiceLoader construction, falling back to the service's ID field.
- Resolve matching TypeScript declarations for ESM and CommonJS consumers.
- Declare Feathers v5 as a peer dependency so consumers can resolve the public types.
- Keep derived `key()` and `multi()` handles independent while sharing service cache state.
- Remove the separate service result cache and use DataLoader's per-value caching for pending requests, records, and missing results.
- Allow retrying failed loads while reusing successful results.
- Snapshot arrays, plain objects, and dates in params so caller or hook mutations cannot change later batches. Keep callbacks and opaque instances by reference.
- Preserve nested callbacks, transactions, dates, circular references, and special primitive values when calculating cache identity without mutating service params.

---

## [v0.2.1](https://github.com/feathersjs-ecosystem/dataloader/tree/v0.2.1) (2025-01-04)

**Bug Fixes:**

- Fixed dot notation keys not working with `.key()` and `.multi()` ([#10](https://github.com/feathersjs-ecosystem/dataloader/issues/10))
  - Keys like `'fact.maescli.id'` now correctly traverse nested objects when mapping results

---

## [v0.2.0](https://github.com/feathersjs-ecosystem/dataloader/tree/v0.2.0) (2025-01-04)

**Breaking Changes:**

- Requires Node.js >= 18
- Updated to Feathers v5 stable dependencies

**Features & Improvements:**

- Converted entire codebase to TypeScript
- Added JSDoc comments to all interfaces and classes
- Dual ESM/CommonJS builds with tsup
- Full type exports for TypeScript users

**Development:**

- Replaced Mocha/Chai with Vitest (97% test coverage)
- Added ESLint flat config with TypeScript support
- Replaced Travis CI with GitHub Actions (Node 18/20/22)
- Switched from npm to pnpm
- Colocated test files next to source files

---

## [v0.3.5](https://github.com/feathers-plus/batch-loader/tree/v0.3.5) (2019-01-02)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.3.4...v0.3.5)

**Merged pull requests:**

- Fixed bug in custom version of makeCallingParams. [\#8](https://github.com/feathers-plus/batch-loader/pull/8) ([eddyystop](https://github.com/eddyystop))

## [v0.3.4](https://github.com/feathers-plus/batch-loader/tree/v0.3.4) (2018-11-24)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.3.3...v0.3.4)

**Closed issues:**

- Creating a batchloader for belongsToMany relationships [\#6](https://github.com/feathers-plus/batch-loader/issues/6)

**Merged pull requests:**

- Add typings, tests and necessary infrastructure [\#5](https://github.com/feathers-plus/batch-loader/pull/5) ([j2L4e](https://github.com/j2L4e))

## [v0.3.3](https://github.com/feathers-plus/batch-loader/tree/v0.3.3) (2018-04-18)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.3.2...v0.3.3)

**Implemented enhancements:**

- Revert old changes and apply new strategy to add pagination support. [\#4](https://github.com/feathers-plus/batch-loader/pull/4) ([otang](https://github.com/otang))

## [v0.3.2](https://github.com/feathers-plus/batch-loader/tree/v0.3.2) (2018-04-13)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.3.1...v0.3.2)

## [v0.3.1](https://github.com/feathers-plus/batch-loader/tree/v0.3.1) (2018-04-13)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.3.0...v0.3.1)

**Fixed bugs:**

- Fix README.md link to documentation page [\#2](https://github.com/feathers-plus/batch-loader/pull/2) ([leedongwei](https://github.com/leedongwei))

**Merged pull requests:**

- Add support for handling page object responses for services using pagination. [\#3](https://github.com/feathers-plus/batch-loader/pull/3) ([otang](https://github.com/otang))

## [v0.3.0](https://github.com/feathers-plus/batch-loader/tree/v0.3.0) (2017-11-14)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.2.1...v0.3.0)

## [v0.2.1](https://github.com/feathers-plus/batch-loader/tree/v0.2.1) (2017-11-14)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.2.0...v0.2.1)

## [v0.2.0](https://github.com/feathers-plus/batch-loader/tree/v0.2.0) (2017-11-13)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.1.2...v0.2.0)

**Closed issues:**

- batch-loader on the browser [\#1](https://github.com/feathers-plus/batch-loader/issues/1)

## [v0.1.2](https://github.com/feathers-plus/batch-loader/tree/v0.1.2) (2017-11-06)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.1.1...v0.1.2)

## [v0.1.1](https://github.com/feathers-plus/batch-loader/tree/v0.1.1) (2017-11-06)

[Full Changelog](https://github.com/feathers-plus/batch-loader/compare/v0.1.0...v0.1.1)

## [v0.1.0](https://github.com/feathers-plus/batch-loader/tree/v0.1.0) (2017-11-06)

\* _This Change Log was automatically generated by [github_changelog_generator](https://github.com/skywinder/Github-Changelog-Generator)_
