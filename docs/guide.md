# Usage guide

## Reuse a loader within each request

Create one `AppLoader` per request and pass it to nested service calls.

```js
import { AppLoader } from 'feathers-dataloader'

const initializeLoader = (context) => {
  context.params.loader ??= new AppLoader({
    app: context.app,
    maxBatchSize: 100
  })
  return context
}

app.hooks({ before: { all: [initializeLoader] } })
```

Pass the authentication and application-specific params the target service needs. Avoid forwarding the parent query into a relationship lookup.

```js
const loadAuthor = (post, context) => {
  const { loader, provider, authentication, user } = context.params
  return loader.service('users').load(post.userId, {
    loader,
    provider,
    authentication,
    user
  })
}
```

Add tenant, transaction, or adapter params as needed.

## Batch related calls

Start loads together with `Promise.all()`, or pass an array of keys:

```js
const users = loader.service('users')
const results = await Promise.all(ids.map((id) => users.load(id, params)))

const sortedUsers = await users.load(ids, params)
```

Keep params consistent across related calls so they can batch. Awaiting each load before starting the next prevents those calls from sharing a batch. See [error handling](./loader/service-loader.md#errors) for the difference between single-key and array loads.

## Clear results after writes

Clear affected services before loading updated data:

```js
await app.service('users').patch(userId, changes, params)
loader.service('users').clear(userId)

const updatedUser = await loader.service('users').load(userId, params)
```

Omit the value to clear the whole service, or use `loader.clear()` to clear every service. Both clear methods are synchronous, and existing loaders can continue to be used.

Cached records are shared objects. Copy them before making local changes.

## Choose a batch size

Set `maxBatchSize` to limit the number of keys in each service query. Per-service options override the global setting.

```js
const loader = new AppLoader({
  app,
  maxBatchSize: 100,
  services: {
    comments: { maxBatchSize: 50 }
  }
})
```

This limits lookup keys, not the number of matching records returned by `multi()`.

## Optional AsyncLocalStorage integration

On Node.js, an around hook can share the loader with nested calls without passing `params.loader` manually:

```js
import { AsyncLocalStorage } from 'node:async_hooks'
import { AppLoader } from 'feathers-dataloader'

const storage = new AsyncLocalStorage()

const initializeLoader = async (context, next) => {
  const loader =
    context.params.loader ??
    storage.getStore()?.loader ??
    new AppLoader({ app: context.app, maxBatchSize: 100 })

  context.params.loader = loader
  return storage.run({ loader }, () => next())
}

app.hooks({ around: [initializeLoader] })
```

Authentication and other service params still need to be passed explicitly.

See the [populating guide](./loader/populating-guide.md) for resolver examples and [ServiceLoader](./loader/service-loader.md) for query restrictions and method details.
