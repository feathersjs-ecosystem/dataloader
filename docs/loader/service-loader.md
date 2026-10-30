---
outline: deep
---

# ServiceLoader

A service loader batches relationship lookups. Obtain one through [AppLoader.service()](./app-loader.md#serviceservicename), or construct one directly.

## new ServiceLoader(options)

```js
import { ServiceLoader } from 'feathers-dataloader'

const users = new ServiceLoader({
  app,
  serviceName: 'users',
  maxBatchSize: 100
})
```

### Options

| Option         | Default                       | Description                                 |
| -------------- | ----------------------------- | ------------------------------------------- |
| `app`          | Required                      | A Feathers application.                     |
| `serviceName`  | Required                      | Name passed to `app.service()`.             |
| `key`          | Service's ID field, or `'id'` | Default field to match when loading values. |
| `maxBatchSize` | `Infinity`                    | Maximum number of keys per batch.           |

## load(value, params = {})

Loads a record using the service's `find()` method with hooks. Compatible calls are batched into a `$in` query.

```js
const user = await users.load(1, params)
const people = await users.load([2, 1, 2, 999], params)
// [user1, user2, user2, null] when 999 is missing
```

The matching field uses the configured `key`, falling back to `service.options.id` and then `'id'`. Array values use JavaScript's default `.sort()` order (string comparison), with duplicates preserved. The input array is not mutated. A missing match returns `null`.

### Params and queries

Params are passed to the service, with pagination disabled and the matching query field replaced by the batch's `$in` condition. Other query conditions are retained.

`$skip`, `$sort`, and `$limit` cause an error because they would apply to the whole batch. Use a direct service query when you need them. If using `$select`, include the matching field so results can be mapped to keys.

### Errors

A single-key load rejects on failure. Array loads can resolve with `Error` entries at failed positions. Invalid query filters reject the entire call.

```js
const results = await users.load([1, 2])
for (const result of results) {
  if (result instanceof Error) {
    // Handle this key's failure.
  }
}
```

## \_load(value, params = {})

Works like `load()`, but calls `_find()` without service hooks. The service must implement `_find()`.

```js
const user = await users._load(1, params)
```

## key(key)

Overrides the default matching field for a loader without changing the original loader. Dot notation is supported when the adapter can query the nested field.

```js
const user = await users.key('email').load('reader@example.com', params)
const event = await loader.service('events').key('metadata.externalId').load('abc', params)
```

## multi()

Returns all matching records per key. Choose the field with `key()`; `multi()` takes no arguments.

```js
const byPost = loader.service('comments').key('postId').multi()
const comments = await byPost.load(1, params) // Record[] or null
const groups = await byPost.load([2, 1], params) // Groups for post 1, then post 2
```

`multi().key('postId')` also works. Without `key()`, the loader's default matching field is used. Missing groups return `null`.

## clear()

Clears cached results for this service, including loaders created with `key()` and `multi()`. Returns the loader synchronously.

```js
users.clear()
```

## TypeScript

The package exports `ServiceLoaderOptions`, `LoadMethod`, and `Params`. Load methods currently return `Promise<unknown>`; use your application's result types when needed.

```ts
type User = { id: number; name: string }
const user = (await users.load(1)) as User | null
```
