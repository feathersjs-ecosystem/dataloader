import { assert, describe, it, beforeEach, expect } from 'vitest'
import { AppLoader, ServiceLoader } from '../src/index.js'
import type { ServiceLoaderOptions } from '../src/serviceLoader.js'
import type { Params, ResultWithId } from '../src/utils.js'
import { makeApp } from './utils.js'

interface BatchParams extends Params {
  query: Record<string, { $in: unknown[] }>
}
interface TestRecord extends ResultWithId {
  id: number
  label: string
  group: string
  body: string
}
const mockApp = (service: object): ServiceLoaderOptions['app'] => {
  return { service: () => service } as unknown as ServiceLoaderOptions['app']
}

const createDefaultCacheParamsFn = () => {
  const loader = new ServiceLoader({ app: mockApp({}), serviceName: 'posts' })
  return loader.options.cacheParamsFn
}

const testFunc = () => {}

describe('serviceLoader.test', () => {
  const app = makeApp()
  it('creates a serviceLoader', () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    assert.isFunction(serviceLoader.load)
    assert.isFunction(serviceLoader._load)
    assert.isFunction(serviceLoader.key)
    assert.isFunction(serviceLoader.multi)
    assert.isFunction(serviceLoader.clear)
    for (const method of ['get', '_get', 'find', '_find']) {
      assert.notProperty(serviceLoader, method)
    }
  })

  it('ignores the removed cacheParamsFn constructor option', () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts',
      // @ts-expect-error The removed JS option must be ignored at runtime.
      cacheParamsFn: testFunc
    })
    assert.notStrictEqual(serviceLoader.options.cacheParamsFn, testFunc)
  })

  describe('default cache params', () => {
    let calls: BatchParams[]
    let loaderApp: ServiceLoaderOptions['app']
    let serviceLoader: ServiceLoader

    beforeEach(() => {
      calls = []
      const service = {
        async find(params: BatchParams) {
          calls.push(params)
          return params.query.id!.$in.map((id) => ({ id, tenant: params.tenant }))
        }
      }
      loaderApp = mockApp(service)
      serviceLoader = new ServiceLoader({ app: loaderApp, serviceName: 'posts' })
    })

    it('batches equivalent queries and forwards original runtime references', async () => {
      const transaction: Record<string, unknown> = {}
      transaction.self = transaction
      const callback = () => {}
      const first = {
        query: { active: true, tenant: 1 },
        transaction,
        callback,
        loader: new AppLoader({ app: loaderApp })
      }
      const second = { ...first, query: { tenant: 1, active: true }, runtime: serviceLoader }

      const results = (await Promise.all([
        serviceLoader.load(1, first),
        serviceLoader.load(2, second)
      ])) as ResultWithId[]

      assert.deepEqual(
        results.map((result) => result.id),
        [1, 2]
      )
      assert.lengthOf(calls, 1)
      assert.deepEqual(calls[0]!.query.id!.$in, [1, 2])
      assert.strictEqual(calls[0]!.transaction, transaction)
      assert.strictEqual(calls[0]!.callback, callback)
      assert.strictEqual(calls[0]!.loader, first.loader)
      assert.deepEqual(first.query, { active: true, tenant: 1 })
    })

    it('separates custom params while reusing results for identical references', async () => {
      const firstTransaction: Record<string, unknown> = {}
      firstTransaction.self = firstTransaction
      const secondTransaction: Record<string, unknown> = {}
      secondTransaction.self = secondTransaction
      const paramsList = [
        { tenant: 1 },
        { tenant: 2 },
        { callback: () => {} },
        { callback: () => {} },
        { transaction: firstTransaction },
        { transaction: secondTransaction },
        { token: Symbol('same') },
        { token: Symbol('same') }
      ]

      for (const params of paramsList) {
        const result = (await serviceLoader.load(1, params)) as ResultWithId
        const cached = await serviceLoader.load(1, { ...params, runtime: serviceLoader })
        assert.strictEqual(cached, result)
        assert.equal(result.tenant, params.tenant)
      }

      assert.lengthOf(calls, paramsList.length)
    })

    it('uses ordinary loader data and explicit query values in cache identity', async () => {
      const paramsList = [
        {},
        { query: undefined },
        { query: null },
        { query: {} },
        { loader: 1 },
        { loader: 2 }
      ]
      for (const params of paramsList) {
        await serviceLoader.load(1, params)
        await serviceLoader.load(1, { ...params, runtime: serviceLoader })
      }

      assert.lengthOf(calls, paramsList.length)
      assert.equal(calls[4]!.loader, 1)
      assert.equal(calls[5]!.loader, 2)
    })

    it('keeps independent service loader caches isolated', async () => {
      const first = new ServiceLoader({ app: loaderApp, serviceName: 'posts' })
      const second = new ServiceLoader({ app: loaderApp, serviceName: 'posts' })
      const firstTransaction = new Map()
      const secondTransaction = new Map()

      assert.notStrictEqual(first.options.loaders, second.options.loaders)
      await first.load(1, { transaction: firstTransaction })
      await second.load(1, { transaction: secondTransaction })

      assert.lengthOf(calls, 2)
      assert.strictEqual(calls[0]!.transaction, firstTransaction)
      assert.strictEqual(calls[1]!.transaction, secondTransaction)

      first.clear()
      assert.equal(first.options.loaders.size, 0)
      assert.equal(second.options.loaders.size, 1)
      await second.load(1, { transaction: secondTransaction })
      assert.lengthOf(calls, 2)
    })

    it('ignores the removed cacheMap option', async () => {
      const cacheMap = new Map()
      // @ts-expect-error The removed JS option must not reach DataLoader.
      const configured = new ServiceLoader({ app: loaderApp, serviceName: 'posts', cacheMap })

      await configured.load(1)
      await configured.load(1)

      assert.notProperty(configured.options, 'cacheMap')
      assert.lengthOf(calls, 1)
      assert.equal(cacheMap.size, 0)
    })

    it.each([false, true])('ignores the removed cache option set to %s', async (cache) => {
      const configured = new ServiceLoader({
        app: loaderApp,
        serviceName: 'posts',
        // @ts-expect-error The removed JS option must not reach DataLoader.
        cache
      })

      const first = await configured.load(1)
      const results = (await configured.load([1, 2])) as unknown[]

      assert.notProperty(configured.options, 'cache')
      assert.strictEqual(results[0], first)
      assert.deepEqual(
        calls.map((params) => params.query.id!.$in),
        [[1], [2]]
      )
    })

    it('batches equivalent nested data while preserving original service params', async () => {
      const callback = () => {}
      const first = {
        query: { active: true, nested: { callback } },
        adapter: { tenant: 1, options: [true, { callback }] }
      }
      const second = {
        adapter: { options: [true, { callback }], tenant: 1 },
        query: { nested: { callback }, active: true }
      }

      await Promise.all([serviceLoader.load(1, first), serviceLoader.load(2, second)])
      assert.lengthOf(calls, 1)
      assert.strictEqual(calls[0]!.adapter, first.adapter)
      assert.strictEqual<unknown>(calls[0]!.query.nested, first.query.nested)

      const cached = (await serviceLoader.load(1, second)) as ResultWithId
      assert.equal(cached.id, 1)
      assert.lengthOf(calls, 1)

      await serviceLoader.load(1, { ...second, adapter: { tenant: 2, options: [true, { callback }] } })
      await serviceLoader.load(1, {
        ...second,
        adapter: { tenant: 1, options: [true, { callback: () => {} }] }
      })
      await serviceLoader.load(1, { ...second, query: { active: true, nested: { callback: () => {} } } })
      assert.lengthOf(calls, 4)
    })

    it('keeps distinct primitive cache identities through service calls', async () => {
      const values = [
        undefined,
        null,
        NaN,
        Infinity,
        -Infinity,
        0,
        -0,
        BigInt(0),
        '0',
        Symbol('x'),
        Symbol('x')
      ]
      for (const value of values) {
        await serviceLoader.load(1, { value })
        await serviceLoader.load(1, { value })
      }
      assert.lengthOf(calls, values.length)
    })

    it('shares the default reference registry with derived handles', () => {
      assert.strictEqual(serviceLoader.key('name').options.cacheParamsFn, serviceLoader.options.cacheParamsFn)
      assert.strictEqual(serviceLoader.multi().options.cacheParamsFn, serviceLoader.options.cacheParamsFn)
    })

    it('ignores removed constructor and per-call cache params overrides', async () => {
      const override = () => {
        throw new Error('Removed override must not run')
      }
      const configured = new ServiceLoader({
        app: loaderApp,
        serviceName: 'posts',
        // @ts-expect-error The removed JS option must be ignored at runtime.
        cacheParamsFn: override
      })

      const results = await Promise.all([
        // @ts-expect-error Per-call cache overrides are no longer supported.
        configured.load(1, { tenant: 1 }, override),
        // @ts-expect-error Per-call cache overrides are no longer supported.
        configured.load(1, { tenant: 2 }, override)
      ])

      assert.deepEqual(results, [
        { id: 1, tenant: 1 },
        { id: 1, tenant: 2 }
      ])
      assert.lengthOf(calls, 2)

      const cached = await configured.load(1, { tenant: 1 })
      assert.strictEqual(cached, results[0])
      assert.lengthOf(calls, 2)
    })
  })

  it('only forwards maxBatchSize and keeps default batching and caching', async () => {
    const calls: unknown[][] = []
    const find = async (params: BatchParams) => {
      const ids = params.query.id!.$in
      calls.push(ids)
      return ids.map((id) => ({ id }))
    }
    const unsupported = () => {
      throw new Error('Removed loader options must not run')
    }
    const serviceLoader = new ServiceLoader({
      app: mockApp({ find }),
      serviceName: 'posts',
      maxBatchSize: 2,
      // @ts-expect-error DataLoader options other than maxBatchSize are removed.
      batch: false,
      cache: false,
      cacheKeyFn: unsupported,
      batchScheduleFn: unsupported,
      name: 'ignored'
    })

    const results = await Promise.all([serviceLoader.load(1), serviceLoader.load(2), serviceLoader.load(3)])
    assert.deepEqual(results, [{ id: 1 }, { id: 2 }, { id: 3 }])
    assert.deepEqual(await serviceLoader.load([1, 2, 3]), results)
    assert.deepEqual(calls, [[1, 2], [3]])
  })

  it('works with load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.load(1)
    assert.deepEqual(result, defaultResult)
  })

  it('uses service.options.id as the default matching field', async () => {
    const record = { uuid: 'user-1' }
    const queries: unknown[] = []
    const loader = new ServiceLoader({
      app: mockApp({
        options: { id: 'uuid' },
        find: async (params: Params) => {
          queries.push(params.query)
          return [record]
        }
      }),
      serviceName: 'users'
    })

    assert.deepEqual(await loader.load('user-1'), record)
    assert.deepEqual(queries, [{ uuid: { $in: ['user-1'] } }])
  })

  it('uses the configured key by default and lets chained loaders override it', async () => {
    const record = { uuid: 'user-1', email: 'reader@example.com', profile: { externalId: 'external-1' } }
    const queries: unknown[] = []
    const find = async (params: Params) => {
      queries.push(params.query)
      return [record]
    }
    const loader = new ServiceLoader({
      app: mockApp({ options: { id: 'uuid' }, find, _find: find }),
      serviceName: 'users',
      key: 'profile.externalId'
    })

    assert.deepEqual(await loader.load('external-1'), record)
    assert.deepEqual(await loader.key('email').load('reader@example.com'), record)
    assert.deepEqual(await loader.multi().load('external-1'), [record])
    assert.deepEqual(await loader.key('uuid')._load('user-1'), record)
    assert.deepEqual(await loader.load('external-1'), record)
    assert.deepEqual(queries, [
      { 'profile.externalId': { $in: ['external-1'] } },
      { email: { $in: ['reader@example.com'] } },
      { 'profile.externalId': { $in: ['external-1'] } },
      { uuid: { $in: ['user-1'] } }
    ])
  })

  it('works with load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await Promise.all([app.service('posts').get(1), app.service('posts').get(2)])
    const result = await serviceLoader.load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('sorts array IDs without mutating the input and preserves duplicates and empty arrays', async () => {
    const loader = new ServiceLoader({ app, serviceName: 'posts' })
    const cases = [
      { ids: Object.freeze([3, 1, 2]), expected: [1, 2, 3] },
      { ids: Object.freeze([2, 1, 2]), expected: [1, 2, 2] },
      { ids: Object.freeze([]), expected: [] }
    ]
    for (const method of ['load', '_load'] as const) {
      for (const { ids, expected } of cases) {
        const results = (await loader[method](ids)) as ResultWithId[]
        assert.deepEqual(
          results.map((record) => record.id),
          expected
        )
      }
    }
  })

  it('uses default string sorting and shares cached records across array permutations', async () => {
    const records = [{ id: 2 }, { id: 10 }, { id: 1 }]
    const queries: Params[] = []
    const find = async (params: Params) => {
      queries.push(params)
      return records
    }
    const loader = new ServiceLoader({ app: mockApp({ find }), serviceName: 'records' })
    const results = (await loader.load([2, 10, 2, 1])) as ResultWithId[]

    assert.deepEqual(
      results.map((record) => record.id),
      [1, 10, 2, 2]
    )
    assert.deepEqual(queries[0]!.query, { id: { $in: [1, 10, 2] } })
    const repeated = (await loader.load([1, 2, 10, 2])) as ResultWithId[]
    assert.notStrictEqual(repeated, results)
    repeated.forEach((record, index) => assert.strictEqual(record, results[index]))
    assert.lengthOf(queries, 1)
  })

  it('retains upstream dot notation support in keyed and multi loading', async () => {
    const records = [
      { id: 1, nested: { code: 'first', group: 'a' } },
      { id: 2, nested: { code: 'second', group: 'a' } },
      { id: 3, nested: { code: 'third', group: 'b' } }
    ]
    const find = async (params: Params) => {
      const [key, condition] = Object.entries(params.query!)[0]! as [string, { $in: unknown[] }]
      const field = key === 'nested.code' ? 'code' : 'group'
      return records.filter((record) => condition.$in.includes(record.nested[field]))
    }
    const loader = new ServiceLoader({ app: mockApp({ find, _find: find }), serviceName: 'records' })

    assert.deepEqual(await loader.key('nested.code').load(['third', 'first']), [records[0], records[2]])
    assert.deepEqual(await loader.key('nested.group').multi().load(['b', 'a']), [
      records.slice(0, 2),
      [records[2]]
    ])
    assert.deepEqual(await loader.multi().key('nested.group')._load('a'), records.slice(0, 2))
  })

  it('rejects $limit without changing the caller query', async () => {
    const loader = new ServiceLoader({ app, serviceName: 'comments' }).key('postId').multi()
    const query = { $limit: 1 }
    await expect(loader.load(1, { query })).rejects.toThrow('cannot contain')
    await expect(loader._load(1, { query })).rejects.toThrow('cannot contain')
    assert.deepEqual(query, { $limit: 1 })
  })

  it('rejects batch-wide skip and sort filters', async () => {
    const loader = new ServiceLoader({ app, serviceName: 'posts' })
    for (const query of [{ $skip: 1 }, { $sort: { id: 1 } }]) {
      await expect(loader.load(1, { query })).rejects.toThrow('cannot contain')
    }
  })

  it('throws when the service lacks find or _find', async () => {
    const loader = new ServiceLoader({ app: mockApp({}), serviceName: 'missing' })
    await expect(loader.load(1)).rejects.toThrow('does not have a find method')
    await expect(loader._load(1)).rejects.toThrow('does not have a _find method')
  })

  it('works with key("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body').load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body')._load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key").multi().load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const result = (await serviceLoader.key('postId').multi().load(1)) as unknown[]
    assert.deepEqual(result.length, 3)
  })

  it('works with key("key").multi()._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const result = (await serviceLoader.key('postId').multi()._load(1)) as unknown[]
    assert.deepEqual(result.length, 3)
  })

  it('works with key("key").multi().load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const defaultResult = await Promise.all([
      app.service('comments').find({ paginate: false, query: { postId: 1 } }),
      app.service('comments').find({ paginate: false, query: { postId: 2 } })
    ])
    const result = await serviceLoader.key('postId').multi().load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('_load bypasses service hooks', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    let hookCalled = false
    const hookCallback = (context: Params) => {
      hookCalled = true
      return context
    }
    await serviceLoader._load(1, { callback: hookCallback })
    assert.deepEqual(hookCalled, false)
  })

  it('clears', async () => {
    const postsLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const commentsLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })

    await commentsLoader.load(1)

    await postsLoader.load(1)
    await postsLoader._load(1)
    await postsLoader.load([1, 2])

    assert.strictEqual(postsLoader.clear(), postsLoader)

    assert.equal(commentsLoader.options.loaders.size, 1)
    assert.deepEqual(postsLoader.options.loaders.size, 0)
  })

  describe('DataLoader caching', () => {
    it('reuses a pending request for identical lookups', async () => {
      let resolveResult!: (value: ResultWithId[]) => void
      let markStarted!: () => void
      let calls = 0
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      const result = new Promise<ResultWithId[]>((resolve) => {
        resolveResult = resolve
      })
      const service = {
        find() {
          calls++
          markStarted()
          return result
        }
      }
      const loader = new ServiceLoader({ app: mockApp(service), serviceName: 'posts' })
      const first = loader.load(1)
      await started

      const second = loader.load(1)
      resolveResult([{ id: 1 }])

      assert.deepEqual(await Promise.all([first, second]), [{ id: 1 }, { id: 1 }])
      assert.equal(calls, 1)
    })

    it('caches missing results', async () => {
      let calls = 0
      const loader = new ServiceLoader({
        app: mockApp({
          find: async () => {
            calls++
            return []
          }
        }),
        serviceName: 'posts'
      })

      assert.isNull(await loader.load(1))
      assert.isNull(await loader.load(1))
      assert.equal(calls, 1)
    })

    it.each(['load', '_load'] as const)('allows retrying a failed %s request', async (method) => {
      const failure = new Error('Temporary failure')
      let calls = 0
      const find = async () => {
        calls++
        if (calls === 1) {
          throw failure
        }
        return [{ id: 1 }]
      }
      const loader = new ServiceLoader({ app: mockApp({ find, _find: find }), serviceName: 'posts' })

      const results = await Promise.allSettled([loader[method](1), loader[method](1)])
      assert.deepEqual(results, [
        { status: 'rejected', reason: failure },
        { status: 'rejected', reason: failure }
      ])
      assert.equal(calls, 1)

      const fresh = await loader[method](1)
      assert.deepEqual(fresh, { id: 1 })
      assert.strictEqual(await loader[method](1), fresh)
      assert.equal(calls, 2)
    })

    it.each(['load', '_load'] as const)(
      'retries failed array keys through %s while reusing successful keys',
      async (method) => {
        const failure = new Error('Temporary failure')
        const calls: unknown[][] = []
        let failed = false
        const find = async (params: BatchParams) => {
          const ids = params.query.id!.$in
          calls.push(ids)
          if (ids.includes(2) && !failed) {
            failed = true
            throw failure
          }
          return ids.map((id) => ({ id }))
        }
        const loader = new ServiceLoader({
          app: mockApp({ find, _find: find }),
          serviceName: 'posts',
          maxBatchSize: 1
        })

        const first = (await loader[method]([2, 1])) as unknown[]
        assert.deepEqual(first, [{ id: 1 }, failure])
        assert.strictEqual(first[1], failure)

        const fresh = (await loader[method]([1, 2])) as unknown[]
        assert.deepEqual(fresh, [{ id: 1 }, { id: 2 }])
        assert.strictEqual(fresh[0], first[0])
        const repeated = (await loader[method]([2, 1])) as unknown[]
        repeated.forEach((record, index) => assert.strictEqual(record, fresh[index]))
        assert.deepEqual(calls, [[1], [2], [2]])
      }
    )

    it.each([
      { id: 1, targeted: false },
      { id: [1], targeted: false },
      { id: 1, targeted: true },
      { id: [1], targeted: true }
    ])(
      'allows fresh loads after an old request for $id fails following clear (targeted: $targeted)',
      async ({ id, targeted }) => {
        const failure = new Error('Old request failed')
        let rejectOld!: (error: Error) => void
        let markStarted!: () => void
        let calls = 0
        const started = new Promise<void>((resolve) => {
          markStarted = resolve
        })
        const find = () => {
          calls++
          if (calls === 1) {
            markStarted()
            return new Promise<ResultWithId[]>((_resolve, reject) => {
              rejectOld = reject
            })
          }
          return Promise.resolve([{ id: 1, body: 'fresh' }])
        }
        const loader = new ServiceLoader({ app: mockApp({ find }), serviceName: 'posts' })
        const old = loader.load(id).catch((error: unknown) => error)
        await started

        loader.clear(targeted ? id : undefined)
        const fresh = await loader.load(id)

        rejectOld(failure)
        const oldResult = await old
        if (Array.isArray(id)) {
          assert.deepEqual(oldResult, [failure])
        } else {
          assert.strictEqual(oldResult, failure)
        }
        assert.deepEqual(await loader.load(id), fresh)
        // A failed batch clears its keys, including a newer entry for the same key.
        assert.equal(calls, targeted ? 3 : 2)
      }
    )

    it.each([0, ''])('clears the falsy value %j without clearing other values', async (value) => {
      let revision = 0
      const calls: unknown[][] = []
      const find = async (params: BatchParams) => {
        const values = params.query.id!.$in
        calls.push(values)
        return values.map((id) => ({ id, revision }))
      }
      const loader = new ServiceLoader({ app: mockApp({ find }), serviceName: 'records' })
      await loader.load([value, 2])
      revision++

      loader.clear(value)
      const results = (await loader.load([value, 2])) as { id: unknown; revision: number }[]
      assert.deepEqual(results, [
        { id: value, revision: 1 },
        { id: 2, revision: 0 }
      ])
      assert.deepEqual(calls, [[value, 2], [value]])
    })

    it.each([false, true])(
      'clears a pending request without cancelling it (targeted: %s)',
      async (targeted) => {
        let resolveOld!: (value: ResultWithId[]) => void
        let markStarted!: () => void
        let calls = 0
        const started = new Promise<void>((resolve) => {
          markStarted = resolve
        })
        const service = {
          find() {
            calls++
            if (calls === 1) {
              markStarted()
              return new Promise<ResultWithId[]>((resolve) => {
                resolveOld = resolve
              })
            }
            return Promise.resolve([{ id: 1, body: 'fresh' }])
          }
        }
        const loader = new ServiceLoader({ app: mockApp(service), serviceName: 'posts' })
        const pending = loader.load(1)
        await started

        assert.strictEqual(loader.clear(targeted ? 1 : undefined), loader)
        assert.equal(loader.options.loaders.size, targeted ? 1 : 0)
        assert.deepEqual(await loader.load(1), { id: 1, body: 'fresh' })

        resolveOld([{ id: 1, body: 'old' }])
        assert.deepEqual(await pending, { id: 1, body: 'old' })
        assert.deepEqual(await loader.load(1), { id: 1, body: 'fresh' })
        assert.equal(calls, 2)
      }
    )
  })

  describe('chained loaders', () => {
    let records: TestRecord[]
    let calls: BatchParams[]
    let loaderApp: ServiceLoaderOptions['app']
    let loader: ServiceLoader

    beforeEach(() => {
      records = [
        { id: 1, label: 'first', group: 'a', body: 'original' },
        { id: 2, label: 'second', group: 'a', body: 'original' },
        { id: 3, label: 'third', group: 'b', body: 'original' }
      ]
      calls = []
      const find = async (params: BatchParams) => {
        calls.push(params)
        return records
          .filter((record) => {
            return Object.entries(params.query).every(([key, condition]) =>
              condition.$in.includes(record[key])
            )
          })
          .map((record) => ({ ...record }))
      }
      const service = { find, _find: find }
      loaderApp = mockApp(service)
      loader = new ServiceLoader({ app: loaderApp, serviceName: 'records' })
    })

    it('preserves chain state in either order without changing the original handle', async () => {
      const keyed = loader.key('label')
      const keyedMulti = keyed.multi()
      const multiKeyed = loader.multi().key('label')
      const regrouped = keyedMulti.key('group').multi()

      assert.strictEqual(keyed.options, loader.options)
      assert.strictEqual(keyedMulti.options, loader.options)
      assert.strictEqual(multiKeyed.options, loader.options)
      assert.deepEqual(await loader.load(1), records[0])
      assert.deepEqual(await keyed.load('first'), records[0])
      assert.deepEqual(await keyedMulti.load('first'), [records[0]])
      assert.deepEqual(await multiKeyed.load('first'), [records[0]])
      assert.deepEqual(await regrouped.load('a'), records.slice(0, 2))
      assert.deepEqual(await keyed.load('second'), records[1])
      assert.deepEqual(await loader.load(3), records[2])
    })

    it('reuses key and value lookups across equivalent chained loaders', async () => {
      const single = await loader.key('label').load('first')
      assert.deepEqual(single, records[0])
      assert.strictEqual(await loader.key('label').load('first'), single)

      const groups = await loader.key('group').multi()._load(['b', 'a'])
      assert.deepEqual(groups, [records.slice(0, 2), [records[2]]])
      const repeated = (await loader.multi().key('group')._load(['a', 'b'])) as unknown[]
      repeated.forEach((group, index) => assert.strictEqual(group, (groups as unknown[])[index]))
      assert.deepEqual(
        calls.map((params) => params.query),
        [{ label: { $in: ['first'] } }, { group: { $in: ['a', 'b'] } }]
      )
    })

    it('uses the default service key when multi is called without key()', async () => {
      assert.deepEqual(await loader.multi().load(1), [records[0]])
      assert.deepEqual(await loader.multi().load([1, 3]), [[records[0]], [records[2]]])
    })

    it('batches and reuses cached results across separately created keyed handles', async () => {
      const results = await Promise.all([
        loader.key('label').load('first'),
        loader.key('label').load('second')
      ])

      assert.deepEqual<unknown>(results, records.slice(0, 2))
      assert.lengthOf(calls, 1)
      assert.deepEqual(calls[0]!.query.label!.$in, ['first', 'second'])
      assert.deepEqual(await loader.key('label').load(['second', 'first']), [records[0], records[1]])
      assert.lengthOf(calls, 1)
    })

    it('batches equivalent multi handles created in different chain orders', async () => {
      const results = await Promise.all([
        loader.key('group').multi().load('a'),
        loader.multi().key('group').load('b')
      ])

      assert.deepEqual(results, [records.slice(0, 2), [records[2]]])
      assert.lengthOf(calls, 1)
      assert.deepEqual(calls[0]!.query.group!.$in, ['a', 'b'])
    })

    it('preserves maxBatchSize and default ID caching on derived handles', async () => {
      const configured = new ServiceLoader({
        app: loaderApp,
        serviceName: 'records',
        maxBatchSize: 1
      })
      const derived = configured.multi().key('id')
      const results = await derived.load([1, 2, 3])

      assert.deepEqual(
        results,
        records.map((record) => [record])
      )
      assert.lengthOf(calls, 3)
      calls.forEach((params) => assert.lengthOf(params.query.id!.$in, 1))
      assert.deepEqual(await derived.load('1'), [records[0]])
      assert.lengthOf(calls, 3)
    })

    it('clears every cached variant from base or derived handles after repeated writes', async () => {
      const keyed = loader.key('label')
      const multi = loader.key('group').multi()
      const readAll = () =>
        Promise.all([loader.load(1), keyed.load('first'), multi.load('a'), multi._load('a')]) as Promise<
          [ResultWithId, ResultWithId, ResultWithId[], ResultWithId[]]
        >

      for (const [index, clearer] of [loader, keyed, multi].entries()) {
        const before = await readAll()
        const body = `revision ${index}`
        records[0]!.body = body
        assert.notEqual(before[0].body, body)

        assert.strictEqual(clearer.clear(), clearer)
        assert.equal(loader.options.loaders.size, 0)

        const after = await readAll()
        assert.equal(after[0].body, body)
        assert.equal(after[1].body, body)
        assert.equal(after[2][0]!.body, body)
        assert.equal(after[3][0]!.body, body)
      }
    })

    it.each(['load', '_load'] as const)(
      'clears one value from single and overlapping array results for %s',
      async (method) => {
        const before = (await loader[method]([3, 1, 2])) as TestRecord[]
        await loader[method]([2, 1])
        await loader[method](1)
        records[0]!.body = 'updated'

        assert.strictEqual(loader.clear('1'), loader)
        assert.strictEqual(await loader[method](2), before[1])
        const after = (await loader[method]([3, 1, 2])) as TestRecord[]
        assert.equal(after[0]!.body, 'updated')
        assert.strictEqual(after[1], before[1])
        assert.strictEqual(after[2], before[2])
        assert.deepEqual(await loader[method]([2, 1]), after.slice(0, 2))
        assert.strictEqual(await loader[method](1), after[0])
        assert.deepEqual(
          calls.map((params) => params.query.id!.$in),
          [[1, 2, 3], [1]]
        )
      }
    )

    it('clears an array of values while retaining other cached records', async () => {
      const before = (await loader.load([1, 2, 3])) as TestRecord[]
      records[0]!.body = 'updated first'
      records[2]!.body = 'updated third'
      const values = Object.freeze([3, 1, 3])

      assert.strictEqual(loader.clear(values), loader)
      const after = (await loader.load([1, 2, 3])) as TestRecord[]
      assert.equal(after[0]!.body, 'updated first')
      assert.strictEqual(after[1], before[1])
      assert.equal(after[2]!.body, 'updated third')
      assert.deepEqual(values, [3, 1, 3])
      assert.deepEqual(
        calls.map((params) => params.query.id!.$in),
        [
          [1, 2, 3],
          [1, 3]
        ]
      )
    })

    it('clears string values using the configured key', async () => {
      records[0]!.label = 'na@example.com'
      const configured = new ServiceLoader({ app: loaderApp, serviceName: 'records', key: 'label' })
      await configured.load('na@example.com')
      records[0]!.body = 'updated'

      assert.strictEqual(configured.clear('na@example.com'), configured)
      assert.equal(((await configured.load('na@example.com')) as TestRecord).body, 'updated')
      assert.lengthOf(calls, 2)
    })

    it('clears matching values across params, modes, and methods', async () => {
      const variants = [
        { handle: loader, method: 'load', params: { scope: 'first' } },
        { handle: loader, method: '_load', params: { scope: 'second' } },
        { handle: loader.multi(), method: 'load', params: { scope: 'second' } },
        { handle: loader.multi(), method: '_load', params: { scope: 'first' } }
      ] as const
      const readAll = () =>
        Promise.all(variants.map(({ handle, method, params }) => handle[method]([1, 2], params)))
      const before = (await readAll()) as (TestRecord | TestRecord[])[][]
      records[0]!.body = 'updated'

      loader.multi().clear(1)
      const after = (await readAll()) as (TestRecord | TestRecord[])[][]
      after.forEach((results, index) => {
        const first = results[0]!
        assert.equal((Array.isArray(first) ? first[0]! : first).body, 'updated')
        assert.strictEqual(results[1], before[index]![1])
      })
      assert.lengthOf(calls, 8)
      calls.slice(4).forEach((params) => assert.deepEqual(params.query.id!.$in, [1]))
    })

    it('targets the current key without invalidating another key with the same value', async () => {
      records[0]!.label = '1'
      const byLabel = loader.key('label')
      const before = await loader.load(1)
      await byLabel.load('1')
      records[0]!.body = 'updated'

      byLabel.clear('1')
      assert.equal(((await byLabel.load('1')) as TestRecord).body, 'updated')
      assert.strictEqual(await loader.load(1), before)
      assert.lengthOf(calls, 3)
    })

    it('clears cached missing results', async () => {
      assert.isNull(await loader.load(4))
      records.push({ id: 4, label: 'fourth', group: 'b', body: 'new' })

      loader.clear(4)
      assert.deepEqual(await loader.load(4), records[3])
      assert.lengthOf(calls, 2)
    })

    it('leaves caches unchanged when clearing an empty array', async () => {
      const before = await loader.load([1, 2])
      assert.strictEqual(loader.clear([]), loader)
      const repeated = (await loader.load([1, 2])) as unknown[]
      repeated.forEach((record, index) => assert.strictEqual(record, (before as unknown[])[index]))
      assert.lengthOf(calls, 1)
    })

    it('clears retained derived handles through AppLoader.clear()', async () => {
      const appLoader = new AppLoader({ app: loaderApp })
      const derived = appLoader.service('records').key('group').multi()
      await derived.load('a')
      records[0]!.body = 'updated'

      assert.strictEqual(appLoader.clear(), appLoader)

      assert.equal(((await derived.load('a')) as ResultWithId[])[0]!.body, 'updated')
      assert.lengthOf(calls, 2)
    })

    it('preserves subclass methods and runs subclass initialization on derived handles', async () => {
      class CustomLoader extends ServiceLoader {
        custom: string

        constructor(...args: ConstructorParameters<typeof ServiceLoader>) {
          super(...args)
          this.custom = 'custom'
        }

        customLoad(id: unknown) {
          return this.load(id)
        }
      }
      const custom = new CustomLoader({ app: loaderApp, serviceName: 'records' })
      const derived = custom.key('label').multi()

      assert.instanceOf(derived, CustomLoader)
      assert.equal(derived.custom, 'custom')
      assert.deepEqual(await derived.customLoad('first'), [records[0]])
    })
  })

  describe('cache params serialization', () => {
    it('returns a JSON cache key directly', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const key = cacheParamsFn({ query: { active: true } })

      assert.isString(key)
      assert.doesNotThrow(() => JSON.parse(key))
    })

    it('default cache params include primitive params and ordinary data named loader', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const params = {
        provider: 'rest',
        tenant: 0,
        enabled: false,
        label: '',
        optional: undefined,
        nullable: null,
        query: { prop: 1 },
        loader: { app: {} }
      }
      const key = cacheParamsFn(params)
      for (const property of Object.keys(params)) {
        const changed: Record<string, unknown> = { ...params }
        delete changed[property]
        assert.notEqual(cacheParamsFn(changed), key, `${property} must affect cache identity`)
      }
    })

    it('default cache params preserve missing, undefined, null, and empty queries', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const empty = cacheParamsFn({})
      assert.equal(cacheParamsFn(), empty)
      assert.equal(cacheParamsFn(undefined), empty)
      const keys = [{}, { query: undefined }, { query: null }, { query: {} }].map(cacheParamsFn)
      assert.equal(new Set(keys).size, keys.length)
    })

    it('treats an explicit null params argument as an empty object', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      assert.equal(cacheParamsFn(null), cacheParamsFn({}))
    })

    it('default cache params exclude ServiceLoader and its subclasses regardless of property name', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const app = mockApp({})
      class CustomServiceLoader extends ServiceLoader {}
      const serviceLoader = new ServiceLoader({ app, serviceName: 'posts' })
      const values = [serviceLoader, new CustomServiceLoader({ app, serviceName: 'posts' })]

      for (const value of values) {
        assert.equal(
          cacheParamsFn({ runtime: value, loader: 'ordinary data' }),
          cacheParamsFn({ loader: 'ordinary data' })
        )
        const nested = { query: { runtime: value }, options: [1, value, { runtime: value, loader: true }] }
        assert.equal(
          cacheParamsFn(nested),
          cacheParamsFn({ query: {}, options: [1, undefined, { loader: true }] })
        )
      }
    })

    it('default cache params compare equivalent queries by value', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const first = { query: { active: true, tenant: { $in: [1, 2] } } }
      const second = { query: { tenant: { $in: [1, 2] }, active: true } }
      assert.equal(cacheParamsFn(first), cacheParamsFn(second))
    })

    it('default cache params compare opaque objects and functions by reference', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      class Transaction {}
      for (const create of [() => new Transaction(), () => new Map(), () => new Set(), () => () => {}]) {
        const value = create()
        const first = cacheParamsFn({ value })
        assert.equal(cacheParamsFn({ value }), first)
        assert.notEqual(cacheParamsFn({ value: create() }), first)
      }
    })

    it('default cache params serialize circular runtime objects without mutating params', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const transaction: Record<string, unknown> = {}
      transaction.self = transaction
      const query = Object.freeze({ active: true })
      const params = Object.freeze({
        query,
        transaction,
        callback: () => {},
        loader: new ServiceLoader({ app: mockApp({}), serviceName: 'posts' })
      })
      const key = cacheParamsFn(params)

      assert.doesNotThrow(() => JSON.parse(key))
      assert.strictEqual(params.query, query)
      assert.strictEqual(params.transaction, transaction)
      assert.strictEqual(transaction.self, transaction)
      assert.equal(key, cacheParamsFn({ query, transaction, callback: params.callback }))
    })

    it('default cache params recursively preserve data and reference nested functions', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const callback = () => {}
      const opaque = new Map()
      const shared = Object.freeze({ value: 1 })
      const options = Object.freeze({
        loader: 'nested data',
        items: Object.freeze([shared, shared, Object.freeze({ callback, opaque })])
      })
      const params = Object.freeze({ options, query: Object.freeze({ callback }) })
      const key = cacheParamsFn(params)

      assert.equal(
        key,
        cacheParamsFn({
          query: { callback },
          options: {
            loader: 'nested data',
            items: [{ value: 1 }, { value: 1 }, { callback, opaque }]
          }
        })
      )
      assert.notEqual(key, cacheParamsFn({ ...params, options: { ...options, items: [shared] } }))
      assert.notEqual(key, cacheParamsFn({ ...params, query: { callback: () => {} } }))
      assert.strictEqual(params.options.items[0], shared)
    })

    it('default cache params distinguish primitive values in arrays and object properties', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const values = [undefined, null, false, '', 0, -0, NaN, Infinity, -Infinity, BigInt(1), Symbol('x')]
      const objects = values.map((value) => cacheParamsFn({ value }))
      const arrays = values.map((value) => cacheParamsFn({ nested: [value] }))

      assert.equal(new Set(objects).size, values.length)
      assert.equal(new Set(arrays).size, values.length)
    })

    it('cache encoding distinguishes special primitives, types, and sparse arrays', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const values = [
        undefined,
        null,
        false,
        '',
        0,
        -0,
        NaN,
        Infinity,
        -Infinity,
        1,
        BigInt(1),
        '1',
        Symbol('same'),
        Symbol('same'),
        {},
        [],
        [undefined],
        Array(1),
        new Date(0),
        new Date(NaN),
        '1970-01-01T00:00:00.000Z'
      ]
      const keys = values.map((value) => cacheParamsFn({ value }))
      assert.equal(new Set(keys).size, values.length)
      assert.notEqual(cacheParamsFn({}), keys[0])
    })

    it('cache encoding cannot confuse ordinary data with reference tokens', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const key = cacheParamsFn({ value: () => {} })
      const [, entries] = JSON.parse(key) as [string, [[string, string], [string, string]][]]
      const [, [, reference]] = entries.find(([encodedKey]) => encodedKey[1] === 'value')!

      assert.exists(reference)
      assert.notEqual(key, cacheParamsFn({ value: { reference } }))
      assert.notEqual(key, cacheParamsFn({ value: ['reference', reference] }))
    })

    it('cache encoding handles null-prototype objects and enumerable symbol properties', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const symbol = Symbol('key')
      const value = Object.assign(Object.create(null), { [symbol]: 1, nested: { value: 2 } })
      const equivalent = { nested: { value: 2 }, [symbol]: 1 }
      const different = { nested: { value: 2 }, [Symbol('key')]: 1 }
      const key = cacheParamsFn({ value })

      assert.equal(key, cacheParamsFn({ value: equivalent }))
      assert.notEqual(key, cacheParamsFn({ value: different }))
    })

    it('cache encoding preserves an own __proto__ property as ordinary data', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const value = JSON.parse('{"__proto__":{"enabled":true}}')
      const key = cacheParamsFn({ value })
      assert.isTrue(Object.prototype.hasOwnProperty.call(value, '__proto__'))
      assert.notEqual(key, cacheParamsFn({ value: {} }))
      assert.notEqual(key, cacheParamsFn({ value: JSON.parse('{"__proto__":{"enabled":false}}') }))
    })

    it('cache encoding compares dates and explicit JSON representations by value', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      class JsonValue {
        toJSON() {
          return { nested: [1, 2] }
        }
      }
      const first = { date: new Date(0), custom: new JsonValue() }
      const second = { custom: new JsonValue(), date: new Date(0) }
      assert.equal(cacheParamsFn(first), cacheParamsFn(second))

      class InvalidJson {
        toJSON() {
          throw new Error('Cannot serialize')
        }
      }
      const value = new InvalidJson()
      assert.equal(cacheParamsFn({ value }), cacheParamsFn({ value }))
      assert.notEqual(cacheParamsFn({ value }), cacheParamsFn({ value: new InvalidJson() }))
    })

    it('default cache params reference circular edges in objects and arrays', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const value: { data: number[]; self?: unknown } = { data: [1, 2] }
      value.self = value
      const array: unknown[] = [value]
      array.push(array)
      const key = cacheParamsFn({ array })

      assert.doesNotThrow(() => JSON.parse(key))
      assert.equal(key, cacheParamsFn({ array }))
      assert.strictEqual(array[0], value)
      assert.strictEqual(array[1], array)
      assert.strictEqual(value.self, value)
      value.data.push(3)
      assert.notEqual(key, cacheParamsFn({ array }))
      value.data.pop()
      assert.equal(key, cacheParamsFn({ array }))
    })

    it('default cache params reference objects whose enumerable properties cannot be read', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const value = Object.defineProperty({}, 'unreadable', {
        enumerable: true,
        get() {
          throw new Error('Cannot serialize')
        }
      })
      const key = cacheParamsFn({ value })
      assert.doesNotThrow(() => JSON.parse(key))
      assert.equal(key, cacheParamsFn({ value }))
      assert.notEqual(key, cacheParamsFn({ value: {} }))
    })

    it('default cache params treat AppLoader as an ordinary opaque object', () => {
      const cacheParamsFn = createDefaultCacheParamsFn()
      const first = new AppLoader({ app: mockApp({}) })
      const second = new AppLoader({ app: mockApp({}) })
      const key = cacheParamsFn({ loader: first })

      assert.notEqual(key, cacheParamsFn({}))
      assert.equal(key, cacheParamsFn({ loader: first }))
      assert.notEqual(key, cacheParamsFn({ loader: second }))
    })
  })
})
