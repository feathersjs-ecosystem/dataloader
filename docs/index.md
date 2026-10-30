# feathers-dataloader documentation

These pages describe the upcoming V1 API. For changes from 0.2.x, start with the [migration guide](./loader/migration-guide.md).

`AppLoader` creates and reuses a `ServiceLoader` for each service in a request. Each service loader batches compatible `load()` calls and caches their results in memory. Use `key()` to choose a matching field and `multi()` to return every matching record per key.

```js
import { AppLoader } from 'feathers-dataloader'

const loader = new AppLoader({ app })
const users = await loader.service('users').load([1, 2, 3])
const comments = await loader.service('comments').key('postId').multi().load([1, 2, 3])
```

## Guides

- [Usage guide](./guide.md): sharing loaders, batching calls, and clearing after writes.
- [Populating data](./loader/populating-guide.md): related records in Feathers resolvers.
- [Migration to V1](./loader/migration-guide.md): removed methods and options, updated chaining, and behavioral changes.

## API

- [Loader overview](./loader/index.md)
- [AppLoader](./loader/app-loader.md)
- [ServiceLoader](./loader/service-loader.md)
- [Utilities](./loader/loader-utils.md)

The package includes TypeScript declarations and supports both ESM imports and CommonJS `require`. See the [README](../README.md) for installation and development commands, and the [changelog](../CHANGELOG.md) for release history.
