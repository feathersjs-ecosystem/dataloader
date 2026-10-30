---
outline: deep
---

# AppLoader

`AppLoader` creates and reuses service loaders within a request or unit of work.

## new AppLoader(options)

```js
import { AppLoader } from 'feathers-dataloader'

const loader = new AppLoader({
  app,
  maxBatchSize: 100,
  services: {
    comments: { key: 'postId', maxBatchSize: 50 }
  }
})
```

| Option         | Default                       | Description                                                              |
| -------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `app`          | Required                      | A Feathers application.                                                  |
| `services`     | `{}`                          | Per-service `key` and `maxBatchSize` settings, overriding global values. |
| `key`          | Service's ID field, or `'id'` | Default field to match when loading values.                              |
| `maxBatchSize` | `Infinity`                    | Maximum number of keys per batch.                                        |

## service(serviceName)

Returns the service's `ServiceLoader`, creating it on first use. Repeated calls with the same service name return the same loader.

```js
const users = loader.service('users')
const sameUsers = loader.service('users')
console.log(users === sameUsers) // true

const user = await users.load(1, params)
const authors = await users.key('role').multi().load('author', params)
```

Each service owns separate caches. See [ServiceLoader](./service-loader.md) for loading, chaining, and params behavior.

## clear()

Clears cached results for every service and returns the `AppLoader` synchronously. Existing service loaders can continue to be used.

```js
loader.clear()
```

Use `loader.service('users').clear()` to clear just one service.

## TypeScript

`AppLoaderOptions` describes constructor options. `ServiceConfig` contains the optional `key` and `maxBatchSize` settings.

```ts
import { AppLoader, type AppLoaderOptions } from 'feathers-dataloader'

const options: AppLoaderOptions = { app, maxBatchSize: 100 }
const loader = new AppLoader(options)
```
