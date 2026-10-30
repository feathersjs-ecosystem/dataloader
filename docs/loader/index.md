---
outline: deep
---

# Loaders

`feathers-dataloader` batches compatible relationship lookups into service queries and maps results back to the requested keys. These docs describe the upcoming V1 API.

## AppLoader

An [AppLoader](./app-loader.md) lazily creates one service loader per service name. Create one per request or unit of work and reuse it in nested calls.

```js
import { AppLoader } from 'feathers-dataloader'

const loader = new AppLoader({ app, maxBatchSize: 100 })
const users = loader.service('users')

const results = await Promise.all([users.load(1), users.load(2)])
```

## ServiceLoader

A [ServiceLoader](./service-loader.md) provides `load()` and `_load()`, with `key()` and `multi()` to configure the relationship.

| Lookup                      | Example                                         | Result when matched                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------ |
| One record by ID            | `users.load(1)`                                 | A record                             |
| One record per ID           | `users.load([2, 1])`                            | Records ordered by sorted keys       |
| One record by another field | `users.key('email').load('reader@example.com')` | A record                             |
| Many records for one key    | `comments.key('postId').multi().load(1)`        | An array of records                  |
| Many records per key        | `comments.key('postId').multi().load([2, 1])`   | Record groups ordered by sorted keys |

Missing matches return `null`. Array loads can also contain `Error` entries. `multi()` takes no key argument; it can be chained before or after `key()`.

## DataLoader and utilities

The package also re-exports `DataLoader` and provides helpers for deduplicating keys and mapping results. See [loader utilities](./loader-utils.md) to build a custom batch function.

Continue with the [usage guide](../guide.md), [populating guide](./populating-guide.md), or [V1 migration guide](./migration-guide.md).
