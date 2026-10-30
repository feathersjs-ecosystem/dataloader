---
outline: deep
---

# Populating data

Use a request-scoped `AppLoader` to fetch related records from resolvers. Compatible lookups across records can share one batch, and repeated lookups reuse cached results.

## Initialize the loader

Register an application before hook before services start handling requests:

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

## Resolve relationships

This example assumes posts have `userId`, `categoryName`, and optional `tagIds`, and comments have `postId`.

```js
import { hooks as schemaHooks, resolve, virtual } from '@feathersjs/schema'

const relatedParams = (params) => ({
  loader: params.loader,
  provider: params.provider,
  authentication: params.authentication,
  user: params.user,
  tenantId: params.tenantId
})

const postResolver = resolve({
  author: virtual((post, context) =>
    context.params.loader.service('users').load(post.userId, relatedParams(context.params))
  ),
  category: virtual((post, context) =>
    context.params.loader
      .service('categories')
      .key('name')
      .load(post.categoryName, relatedParams(context.params))
  ),
  tags: virtual((post, context) =>
    context.params.loader.service('tags').load(post.tagIds ?? [], relatedParams(context.params))
  ),
  comments: virtual(async (post, context) => {
    const comments = await context.params.loader
      .service('comments')
      .key('postId')
      .multi()
      .load(post.id, relatedParams(context.params))

    return comments ?? []
  })
})

app.service('posts').hooks({
  around: {
    all: [schemaHooks.resolveResult(postResolver)]
  }
})
```

Feathers requires `resolveResult` as an around hook and recommends virtual properties for computed fields with database adapters. See the [Feathers resolver documentation](https://feathersjs.com/api/schema/resolvers#resolveresult).

Add transaction or other service-specific params to `relatedParams` as needed. Avoid forwarding the parent post query into a users, categories, tags, or comments lookup. Also configure external resolvers on related services when those results need filtering for external clients.

## Result shapes

| Relationship              | Loader expression                                | Result                                             |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Many posts to one user    | `users.load(post.userId)`                        | User or `null`                                     |
| One category by name      | `categories.key('name').load(post.categoryName)` | Category or `null`                                 |
| Tags by an array of IDs   | `tags.load(post.tagIds)`                         | One record, `null`, or `Error` per input ID        |
| One post to many comments | `comments.key('postId').multi().load(post.id)`   | Comment array or `null`                            |
| Comments for many posts   | `comments.key('postId').multi().load(postIds)`   | One comment array, `null`, or `Error` per input ID |

The example converts a missing comment group to `[]` for the application response. Array loads can contain `Error` entries; handle them before returning a response if a related lookup fails.

## Nested fields

```js
const records = await loader.service('events').key('metadata.ownerId').multi().load(userId, params)
```

The adapter must support `'metadata.ownerId'` in the query. Returned records must contain the nested `metadata.ownerId` value, including when using `$select`.

## Avoid recursive relationships

Because `load()` runs the target service's hooks and resolvers, a post that resolves its author can trigger user resolvers too. Design the resolver graph to stop cycles such as posts → users → posts. An internal `_load()` bypasses the target service's hooks entirely; use it only when that behavior is appropriate.

See the [usage guide](../guide.md) for sharing loaders and clearing results after writes.
