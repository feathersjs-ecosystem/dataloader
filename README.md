# feathers-dataloader

> Reduce requests to backend services by batching calls and caching records.

## Installation

```bash
npm install feathers-dataloader
```

## TLDR

```ts
Promise.all([app.service('posts').get(1), app.service('posts').get(2), app.service('posts').get(3)])
```

is slower than

```ts
app.service('posts').find({
  query: { id: { $in: [1, 2, 3] } }
})
```

Feathers Dataloader makes it easy and fast to write these kinds of queries. The loader handles coalescing all of the IDs into one request and mapping them back to the proper caller.

```ts
const loader = new AppLoader({ app: context.app })

Promise.all([
  loader.service('posts').load(1),
  loader.service('posts').load(2),
  loader.service('posts').load(3)
])
```

is automatically converted to

```ts
app.service('posts').find({ query: { id: { $in: [1, 2, 3] } } })
```

Results are mapped back to the requested keys, regardless of the order returned by the service.

```js
// One record per ID, ordered by sorted keys (1, 2, 2).
const people = await users.load([2, 1, 2])

// Match a different field, including a nested field supported by your adapter.
const person = await users.key('email').load('reader@example.com')

// Return all comments for each post.
const comments = await loader.service('comments').key('postId').multi().load([1, 2])
```

A missing match returns `null`, including in `multi()` mode.

## Using a loader in hooks

See the [populating guide](./docs/loader/populating-guide.md) for a complete resolver example.

## Behavior to know

- Create one loader per request and pass it to nested calls.
- `load()` uses `find()` with hooks; `_load()` uses `_find()` without hooks.
- `$skip`, `$sort`, and `$limit` cause an error. Use the service directly for those queries.

See the [usage guide](./docs/guide.md) for batching and clearing results after writes.

## Documentation

- [Documentation index](./docs/index.md)
- [Usage guide](./docs/guide.md)
- [AppLoader](./docs/loader/app-loader.md)
- [ServiceLoader](./docs/loader/service-loader.md)
- [Utilities and custom DataLoaders](./docs/loader/loader-utils.md)
- [V1 migration guide](./docs/loader/migration-guide.md)
- [Changelog](./CHANGELOG.md)

## Development

Use the pnpm version pinned in `package.json`.

```bash
pnpm install
pnpm ci          # Type checking, linting, formatting, and tests
pnpm test:watch  # Watch tests
pnpm coverage   # Coverage report
pnpm build      # ESM, CommonJS, and declarations in dist/
```

## License

[MIT](./LICENSE).
