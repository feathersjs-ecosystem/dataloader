const { assert } = require('chai')
const { ServiceLoader } = require('../src')
const { makeApp } = require('./utils')

const testFunc = () => {}

describe('serviceLoader.test', () => {
  const app = makeApp()
  it('creates a serviceLoader', () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    assert.isFunction(serviceLoader.get)
    assert.isFunction(serviceLoader._get)
    assert.isFunction(serviceLoader.find)
    assert.isFunction(serviceLoader._find)
    assert.isFunction(serviceLoader.load)
    assert.isFunction(serviceLoader._load)
    assert.isFunction(serviceLoader.key)
    assert.isFunction(serviceLoader.multi)
    assert.isFunction(serviceLoader.exec)
    assert.isFunction(serviceLoader.clear)
  })

  it('takes a cacheParamsFn option', () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts',
      cacheParamsFn: testFunc
    })
    assert.deepEqual(serviceLoader.options.cacheParamsFn, testFunc)
  })

  it('passes loader options', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts',
      cacheKeyFn: testFunc
    })
    await serviceLoader.load(1)
    const [dataLoader] = serviceLoader.options.loaders.values()
    assert.deepEqual(dataLoader._cacheKeyFn, testFunc)
  })

  it('works with load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.load(1)
    assert.deepEqual(result, defaultResult)
  })

  it('works with load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await Promise.all([app.service('posts').get(1), app.service('posts').get(2)])
    const result = await serviceLoader.load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body').load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body')._load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with multi("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'comments'
    })
    const result = await serviceLoader.multi('postId').load(1)
    assert.deepEqual(result.length, 3)
  })

  it('works with multi("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'comments'
    })
    const result = await serviceLoader.multi('postId')._load(1)
    assert.deepEqual(result.length, 3)
  })

  it('works with multi("key").load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'comments'
    })
    const defaultResult = await Promise.all([
      app.service('comments').find({ paginate: false, query: { postId: 1 } }),
      app.service('comments').find({ paginate: false, query: { postId: 2 } })
    ])
    const result = await serviceLoader.multi('postId').load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('works with get', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.get(1)
    assert.deepEqual(result, defaultResult)
  })

  it('works with find', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const defaultResult = await app.service('posts').find()
    const result = await serviceLoader.find()
    assert.deepEqual(result, defaultResult)
  })

  it('works with underscored methods', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      path: 'posts'
    })
    const methods = ['_get', '_find', '_load']
    let hookCalled = false
    const hookCallback = (context) => {
      hookCalled = true
      return context
    }
    await Promise.all(
      methods.map((method) => {
        if (method === '_find') {
          return serviceLoader[method]({ callback: hookCallback })
        }
        return serviceLoader[method](1, { callback: hookCallback })
      })
    )
    assert.deepEqual(hookCalled, false)
  })

  it('clears', async () => {
    const cacheMap = new Map()
    const postsLoader = new ServiceLoader({
      app,
      path: 'posts',
      cacheMap: cacheMap
    })
    const commentsLoader = new ServiceLoader({
      app,
      path: 'comments',
      cacheMap: cacheMap
    })

    await commentsLoader.load(1)

    await postsLoader.load(1)
    await postsLoader.get(1)
    await postsLoader.find()

    await postsLoader.clear()

    assert.deepEqual(cacheMap.size, 1)
    assert.deepEqual(postsLoader.options.loaders.size, 0)
  })
})
