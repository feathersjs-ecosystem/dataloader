import { describe, it, expect } from 'vitest'
import { ServiceLoader, CacheParamsFn } from './index.js'
import { stableStringify } from './utils.js'
import { makeApp } from '../tests/utils.js'

const testCacheParamsFn: CacheParamsFn = () => undefined
const testCacheKeyFn = () => 'test'

describe('serviceLoader.test', () => {
  const app = makeApp()

  it('creates a serviceLoader', () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    expect(typeof serviceLoader.get).toBe('function')
    expect(typeof serviceLoader._get).toBe('function')
    expect(typeof serviceLoader.find).toBe('function')
    expect(typeof serviceLoader._find).toBe('function')
    expect(typeof serviceLoader.load).toBe('function')
    expect(typeof serviceLoader._load).toBe('function')
    expect(typeof serviceLoader.multi).toBe('function')
    expect(typeof serviceLoader.key).toBe('function')
    expect(typeof serviceLoader.exec).toBe('function')
    expect(typeof serviceLoader.clear).toBe('function')
    expect(typeof serviceLoader.stringifyKey).toBe('function')
  })

  it('takes a cacheParamsFn option', () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts',
      cacheParamsFn: testCacheParamsFn
    })
    expect(serviceLoader.options.cacheParamsFn).toEqual(testCacheParamsFn)
  })

  it('passes loader options', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts',
      cacheKeyFn: testCacheKeyFn
    })
    await serviceLoader.load(1)
    const [dataLoader] = serviceLoader.loaders.values()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((dataLoader as any)._cacheKeyFn).toEqual(testCacheKeyFn)
  })

  it('works with load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.load(1)
    expect(result).toEqual(defaultResult)
  })

  it('works with load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await Promise.all([app.service('posts').get(1), app.service('posts').get(2)])
    const result = await serviceLoader.load([1, 2])
    expect(result).toEqual(defaultResult)
  })

  it('works with key("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body').load('John post')
    expect(result).toEqual(defaultResult)
  })

  it('works with key("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body')._load('John post')
    expect(result).toEqual(defaultResult)
  })

  it('works with multi("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const result = (await serviceLoader.multi('postId').load(1)) as unknown[]
    expect(result.length).toEqual(3)
  })

  it('works with multi("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const result = (await serviceLoader.multi('postId')._load(1)) as unknown[]
    expect(result.length).toEqual(3)
  })

  it('works with multi("key").load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'comments'
    })
    const defaultResult = await Promise.all([
      app.service('comments').find({ paginate: false, query: { postId: 1 } }),
      app.service('comments').find({ paginate: false, query: { postId: 2 } })
    ])
    const result = await serviceLoader.multi('postId').load([1, 2])
    expect(result).toEqual(defaultResult)
  })

  it('works with get', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.get(1)
    expect(result).toEqual(defaultResult)
  })

  it('works with find', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const defaultResult = await app.service('posts').find()
    const result = await serviceLoader.find()
    expect(result).toEqual(defaultResult)
  })

  it('works with underscored methods', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const methods = ['_get', '_find', '_load'] as const
    let hookCalled = false
    const hookCallback = () => {
      hookCalled = true
    }
    await Promise.all(
      methods.map((method) => {
        if (method === '_find') {
          return serviceLoader[method]({ callback: hookCallback })
        }
        return serviceLoader[method](1, { callback: hookCallback })
      })
    )
    expect(hookCalled).toEqual(false)
  })

  it('works with stringifyKey', () => {
    const serviceLoader = new ServiceLoader({
      app,
      serviceName: 'posts'
    })
    const cacheKey = serviceLoader.stringifyKey({ id: 1, key: 'id' })
    const stableKey = stableStringify({
      serviceName: 'posts',
      id: 1,
      key: 'id'
    })
    expect(cacheKey).toEqual(stableKey)
  })

  it('clears', async () => {
    const cacheMap = new Map()
    const postsLoader = new ServiceLoader({
      app,
      serviceName: 'posts',
      cacheMap: cacheMap
    })
    const commentsLoader = new ServiceLoader({
      app,
      serviceName: 'comments',
      cacheMap: cacheMap
    })

    await commentsLoader.load(11)

    await postsLoader.load(1)
    await postsLoader.get(1)
    await postsLoader.find()

    await postsLoader.clear()

    expect(cacheMap.size).toEqual(1)
    expect(postsLoader.loaders.size).toEqual(0)
  })

  it('throws when service lacks find method for load', async () => {
    const testApp = makeApp()
    const service = testApp.service('posts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any).find = undefined
    const serviceLoader = new ServiceLoader({
      app: testApp,
      serviceName: 'posts'
    })
    await expect(serviceLoader.load(1)).rejects.toThrow('does not have a find method')
  })

  it('throws when service lacks _find method for _load', async () => {
    const testApp = makeApp()
    const service = testApp.service('posts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any)._find = undefined
    const serviceLoader = new ServiceLoader({
      app: testApp,
      serviceName: 'posts'
    })
    await expect(serviceLoader._load(1)).rejects.toThrow('does not have a _find method')
  })
})
