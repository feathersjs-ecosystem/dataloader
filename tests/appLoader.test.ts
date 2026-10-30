import { assert, describe, it } from 'vitest'
import { AppLoader, ServiceLoader } from '../src/index.js'
import { makeApp } from './utils.js'

describe('appLoader.test', () => {
  const app = makeApp()
  it('creates an AppLoader', () => {
    const appLoader = new AppLoader({ app })
    assert.isFunction(appLoader.service)
    assert.isFunction(appLoader.clear)
  })

  it('returns a new ServiceLoader', () => {
    const appLoader = new AppLoader({ app })
    const serviceLoader = appLoader.service('posts')
    assert.instanceOf(serviceLoader, ServiceLoader)
    assert.isFunction(serviceLoader.load)
    assert.isFunction(serviceLoader._load)
    assert.isFunction(serviceLoader.key)
    assert.isFunction(serviceLoader.multi)
    assert.isFunction(serviceLoader.clear)
  })

  it('returns a cached ServiceLoader', () => {
    const appLoader = new AppLoader({ app })
    const serviceLoader1 = appLoader.service('posts')
    const serviceLoader2 = appLoader.service('posts')
    assert.deepEqual(serviceLoader1, serviceLoader2)
  })

  it('passes service options', () => {
    const appLoader = new AppLoader({
      app,
      maxBatchSize: 10,
      services: {
        posts: {
          maxBatchSize: 1
        }
      }
    })
    const serviceLoader = appLoader.service('posts')
    assert.equal(serviceLoader.options.maxBatchSize, 1)
  })

  it('creates a separate default cache params registry per service loader', () => {
    const first = new AppLoader({ app })
    const second = new AppLoader({ app })
    const cacheParamsFn = first.service('posts').options.cacheParamsFn

    assert.strictEqual(first.service('posts').options.cacheParamsFn, cacheParamsFn)
    assert.notStrictEqual(first.service('comments').options.cacheParamsFn, cacheParamsFn)
    assert.notStrictEqual(second.service('posts').options.cacheParamsFn, cacheParamsFn)
  })

  it('passes default options', () => {
    const appLoader = new AppLoader({
      app,
      maxBatchSize: 10,
      services: { posts: { maxBatchSize: undefined } }
    })
    const serviceLoader = appLoader.service('posts')
    assert.equal(serviceLoader.options.maxBatchSize, 10)
    assert.equal(appLoader.service('comments').options.maxBatchSize, 10)
  })

  it('uses the global key unless a service specifies its own key', async () => {
    const appLoader = new AppLoader({
      app: makeApp(),
      key: 'userId',
      services: {
        posts: { key: undefined },
        comments: { key: 'postId' }
      }
    })

    const post = (await appLoader.service('posts').load(101)) as { id: number }
    const comments = (await appLoader.service('comments').multi().load(1)) as { postId: number }[]
    assert.equal(post.id, 1)
    assert.lengthOf(comments, 3)
    comments.forEach((comment) => assert.equal(comment.postId, 1))
  })

  it('defaults unconfigured services to their service ID field', async () => {
    const appLoader = new AppLoader({
      app: makeApp(),
      services: { comments: { key: 'postId' } }
    })

    const post = (await appLoader.service('posts').load(1)) as { id: number }
    const comments = (await appLoader.service('comments').multi().load(1)) as unknown[]
    assert.equal(post.id, 1)
    assert.lengthOf(comments, 3)
  })

  it('ignores removed global and service cacheParamsFn overrides', async () => {
    const globalOverride = () => {
      throw new Error('Removed global override must not run')
    }
    const serviceOverride = () => {
      throw new Error('Removed service override must not run')
    }
    const appLoader = new AppLoader({
      app,
      cacheParamsFn: globalOverride,
      // @ts-expect-error The removed per-service option must be ignored at runtime.
      services: { posts: { cacheParamsFn: serviceOverride } }
    })

    for (const path of ['posts', 'comments']) {
      const serviceLoader = appLoader.service(path)
      assert.notStrictEqual(serviceLoader.options.cacheParamsFn, globalOverride)
      assert.notStrictEqual(serviceLoader.options.cacheParamsFn, serviceOverride)
      assert.isString(serviceLoader.options.cacheParamsFn({ tenant: 1 }))
      await serviceLoader.load(path === 'posts' ? 1 : 11)
    }
  })

  it.each(['global', 'service'] as const)('ignores removed %s loader options', async (scope) => {
    const app = makeApp()
    const unsupported = () => {
      throw new Error('Removed loader options must not run')
    }
    const appLoader =
      scope === 'global'
        ? new AppLoader({
            app,
            // @ts-expect-error The removed global option must be ignored at runtime.
            cache: false,
            batch: false,
            cacheKeyFn: unsupported,
            batchScheduleFn: unsupported,
            name: 'ignored'
          })
        : new AppLoader({
            app,
            services: {
              posts: {
                // @ts-expect-error The removed per-service option must be ignored at runtime.
                cache: false,
                batch: false,
                cacheKeyFn: unsupported,
                batchScheduleFn: unsupported,
                name: 'ignored'
              }
            }
          })
    const loader = appLoader.service('posts')
    let calls = 0
    const params = {
      callback: async () => {
        calls++
      }
    }
    const [first] = await Promise.all([loader.load(1, params), loader.load(2, params)])
    const results = (await loader.load([1, 2], params)) as unknown[]

    assert.strictEqual(results[0], first)
    assert.equal(calls, 1)
  })

  it('clears all loaders', async () => {
    const appLoader = new AppLoader({ app })
    const postsLoader = appLoader.service('posts')
    const commentsLoader = appLoader.service('comments')
    await postsLoader.load(1)
    await commentsLoader.load(1)
    assert.deepEqual(appLoader.options.loaders.size, 2)
    assert.deepEqual(postsLoader.options.cacheMap.size, 1)
    assert.deepEqual(commentsLoader.options.cacheMap.size, 1)
    assert.strictEqual(appLoader.clear(), appLoader)
    assert.deepEqual(appLoader.options.loaders.size, 2)
    assert.deepEqual(postsLoader.options.cacheMap.size, 0)
    assert.deepEqual(commentsLoader.options.cacheMap.size, 0)
    assert.equal(postsLoader.options.loaders.size, 0)
    assert.equal(commentsLoader.options.loaders.size, 0)
    assert.strictEqual(appLoader.service('posts'), postsLoader)
    assert.strictEqual(appLoader.service('comments'), commentsLoader)
  })

  it('repeatedly clears caches repopulated through retained and derived handles', async () => {
    const appLoader = new AppLoader({ app: makeApp() })
    const postsLoader = appLoader.service('posts')
    const commentsLoader = appLoader.service('comments')
    const commentsByPost = commentsLoader.key('postId').multi()
    let calls = 0
    const params = {
      callback: async () => {
        calls++
      }
    }

    for (let round = 1; round <= 3; round++) {
      const results = await Promise.all([postsLoader.load(1, params), commentsByPost.load(1, params)])
      assert.isNotNull(results[0])
      assert.lengthOf(results[1] as unknown[], 3)
      assert.equal(calls, round * 2)

      await Promise.all([postsLoader.load(1, params), commentsByPost.load(1, params)])
      assert.equal(calls, round * 2)

      assert.strictEqual(appLoader.clear(), appLoader)
      assert.strictEqual(appLoader.service('posts'), postsLoader)
      assert.strictEqual(appLoader.service('comments'), commentsLoader)
    }
  })
})
