# feathers-dataloader

> Reduce requests to backend services by batching calls and caching records.

## Installation

```bash
npm install feathers-dataloader
```

## Documentation

Please refer to the documentation for more information.

- [Documentation](./docs/index.md) - Definitions for the classes exported from this library
- [Guide](./docs/guide.md) - Common patterns, tips, and best practices

## TLDR

```ts
Promise.all([app.service('posts').get(1), app.service('posts').get(2), app.service('posts').get(3)])
```

is slower than

```ts
app.service('posts').find({ query: { id: { $in: [1, 2, 3] } } })
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

## Quick Start

```ts
import { AppLoader } from 'feathers-dataloader'

// See Guide for more information about how to better pass
// loaders from service to service.
const initializeLoader = (context) => {
  if (context.params.loader) {
    return context
  }
  context.params.loader = new AppLoader({ app: context.app })
  return context
}

// Use this app hook to ensure that a loader is always configured in
// your service hooks. You can now access context.params.loader in any hook.
app.hooks({
  before: {
    all: [initializeLoader]
  }
})

// Loaders are most commonly used in resolvers like @feathersjs/schema,
// withResults, or fastJoin. See the Guide section for more
// information and common usecases.
// Pass the loader to any and all service/loader calls. This maximizes
// performance by allowing the loader to reuse its cache and
// batching mechanism as much as possible.
import { resolveResult, resolve } from '@feathersjs/schema'

const postResultsResolver = resolve({
  properties: {
    user: async (value, post, context) => {
      const { loader } = context.params
      return await loader.service('users').load(post.userId, { loader })
    },
    category: async (value, post, context) => {
      const { loader } = context.params
      return await loader.service('categories').key('name').load(post.categoryName, { loader })
    },
    tags: async (value, post, context) => {
      const { loader } = context.params
      return await loader.service('tags').load(post.tagIds, { loader })
    },
    comments: async (value, post, context) => {
      const { loader } = context.params
      return await loader.service('comments').multi('postId').load(post.id, { loader })
    }
  }
})

app.service('posts').hooks({
  after: {
    all: [resolveResult(postResultsResolver)]
  }
})
```

## Important Notes

### `$limit` is removed from batched queries

The dataloader works by batching multiple `.load()` calls into a single `$in` query. Because of this, `$limit` in your params would apply to the **entire batch**, not per-key. To prevent unexpected results, **`$limit` is automatically removed** from batched `load` and `_load` queries.

For example, with `multi()`:

```ts
// If you have 10 lists and want 4 products per list:
loader
  .service('saved-products')
  .multi('listId')
  .load(listId, {
    query: { $limit: 4 } // This $limit is REMOVED - you'll get ALL matching products
  })
```

The loader batches all `listId` values into one query like `{ listId: { $in: [...allListIds] } }`. A `$limit: 4` would return only 4 products total across all lists, not 4 per list.

If you need per-key limits, handle it after loading:

```ts
const products = await loader.service('saved-products').multi('listId').load(listId)
const limitedProducts = products.slice(0, 4)
```

## Development

This package uses [pnpm](https://pnpm.io/) and [Vitest](https://vitest.dev/) for development.

```bash
pnpm install
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
pnpm coverage    # Run tests with coverage
pnpm build       # Build the package
```

## License

Licensed under the [MIT license](LICENSE).
