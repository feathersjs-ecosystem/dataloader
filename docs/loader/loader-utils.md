---
outline: deep
---

# Loader utilities

The package re-exports `DataLoader` and provides helpers for writing custom batch functions. These utilities can be used independently of `AppLoader` and `ServiceLoader`.

## DataLoader(batchLoadFn, options)

This is the [DataLoader class](https://github.com/graphql/dataloader) from the `dataloader` package. A batch function receives an array of keys and must return one result per key in the same order.

```js
import { DataLoader, uniqueKeys, uniqueResults } from 'feathers-dataloader'

const users = app.service('users')
const usersLoader = new DataLoader(
  async (keys) => {
    const result = await users.find({
      ...params,
      paginate: false,
      query: { id: { $in: uniqueKeys([...keys]) } }
    })
    return uniqueResults([...keys], result)
  },
  { maxBatchSize: 100 }
)

const user = await usersLoader.load(1)
```

Create custom loaders within a request. Refer to the DataLoader documentation for configuration options.

## uniqueKeys(keys)

Deduplicates keys while retaining the first occurrence's value and input order. Keys are compared by their string representation, so `1` and `'1'` are treated as the same key.

```js
uniqueKeys([2, 1, 2, 3]) // [2, 1, 3]
```

Use string or number IDs suitable for your service.

## uniqueResults(keys, result, key = 'id', defaultValue = null)

Maps service records to requested keys, returning one record or the default value per key. Accepts an array or a paginated `{ data: [...] }` result. The matching field supports dot notation.

```js
const records = [
  { id: 1, profile: { externalId: 'a' } },
  { id: 2, profile: { externalId: 'b' } }
]

uniqueResults([2, 1, 9], records)
// [records[1], records[0], null]

uniqueResults(['b', 'a'], { data: records }, 'profile.externalId')
// [records[1], records[0]]
```

Use a unique matching field, or `uniqueResultsMulti()` for all matches.

## uniqueResultsMulti(keys, result, key = 'id', defaultValue = null)

Maps each key to an array of all matching records, preserving service response order within each group. Supports the same result forms and dot paths as `uniqueResults()`.

```js
const comments = [
  { id: 11, postId: 1 },
  { id: 12, postId: 1 },
  { id: 13, postId: 2 }
]

uniqueResultsMulti([2, 1, 9], comments, 'postId')
// [[comments[2]], [comments[0], comments[1]], null]

uniqueResultsMulti([9], comments, 'postId', [])
// [[]]
```

The default for a missing group is `null`. Supply an array as `defaultValue` if a custom batch function needs that shape.

## defaultCacheKeyFn(id)

The default ID cache-key function used by the underlying DataLoader. Falsy values are returned unchanged; other IDs use their `toString()` representation. For example, `defaultCacheKeyFn(1)` is `'1'`, while `defaultCacheKeyFn(0)` is `0`.

## stableStringify(value)

Produces JSON with stable key order for plain objects. Accepts JSON-serializable values and throws a `GeneralError` for functions.

```js
stableStringify({ b: 2, a: 1 }) === stableStringify({ a: 1, b: 2 }) // true
```

## Type exports

The package exports `Params`, `ResultWithId`, and `ServiceResult<T>` for service-call parameters and result mapping, plus `AppLoaderOptions`, `ServiceConfig`, `ServiceLoaderOptions`, and `LoadMethod` for loader configuration.
