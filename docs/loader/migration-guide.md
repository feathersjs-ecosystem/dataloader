---
outline: deep
---

# Migrating to V1

These changes describe the upcoming V1 API compared with 0.2.x.

## Feathers dependency

The package now declares `@feathersjs/feathers@^5.0.31` as a peer dependency. Keep a compatible version installed in your application.

## Service methods

Service loaders no longer expose `get()`, `_get()`, `find()`, or `_find()`. Use `load()` and `_load()` for relationship lookups, or call the Feathers service directly.

```js
const user = await loader.service('users').load(1, params)
const page = await app.service('users').find({
  ...params,
  query: { active: true, $limit: 10 }
})
```

`load()` runs `find()` hooks and returns `null` for missing records. `_load()` calls `_find()` without hooks.

## multi()

Move the matching field from `multi()` to `key()`:

```js
// Before:
loader.service('comments').multi('postId').load(postId, params)

// V1:
loader.service('comments').key('postId').multi().load(postId, params)
```

## Removed configuration

`key` and `maxBatchSize` are the supported loader settings. Remove `batch`, `batchScheduleFn`, `cache`, `cacheKeyFn`, `name`, `cacheMap`, and `cacheParamsFn` options, including per-call `cacheParamsFn` overrides. Params are handled automatically, including custom params, callbacks, and transactions.

Remove custom loader-class options (`BaseLoader` or `ServiceLoader`) from `AppLoader`. For custom batch functions, use [DataLoader](./loader-utils.md) directly.

The instance `stringifyKey()` helper and the `defaultCacheParamsFn`, `CacheParams`, `CacheParamsFn`, and `CacheMap` exports are removed.

## exec()

`exec()` is now private. Replace direct calls with `load()` or `_load()`, using `.key(key)` and `.multi()` as needed.

## Clearing

`clear()` is synchronous and returns its instance. Existing `await clear()` calls still work.

```js
loader.service('users').clear(1) // One value
loader.service('users').clear([1, 2, 3]) // Several values
loader.service('users').clear() // One service
loader.clear() // Every service
```

Existing service loaders can continue to be used after clearing.

## Retrying failed loads

Call `load()` or `_load()` again to retry a failed request; calling `clear()` first is unnecessary. For array loads, failed keys are retried while successful results remain cached.

## Query filters

`$limit`, `$skip`, and `$sort` cause an error in both load methods. `$limit` is no longer silently removed. Call the service directly when you need these filters.

## Direct construction and TypeScript

Use `app` and `serviceName` when constructing a service loader directly:

```ts
import { ServiceLoader } from 'feathers-dataloader'

const users = new ServiceLoader({ app, serviceName: 'users' })
```

Load methods currently return `Promise<unknown>`. Use your application's result types when needed.

See [ServiceLoader](./service-loader.md) for the complete API.
