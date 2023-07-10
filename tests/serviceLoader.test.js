const { assert } = require('chai')
const { ServiceLoader } = require('../src')
const { makeApp } = require('./utils')

const testFunc = () => {}

describe('serviceLoader.test', () => {
  const app = makeApp()
  it('creates a serviceLoader', () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    assert.isFunction(serviceLoader.get)
    assert.isFunction(serviceLoader._get)
    assert.isFunction(serviceLoader.find)
    assert.isFunction(serviceLoader._find)
    assert.isFunction(serviceLoader.load)
    assert.isFunction(serviceLoader._load)
    assert.isFunction(serviceLoader.key)
    assert.isFunction(serviceLoader.select)
    assert.isFunction(serviceLoader.params)
    assert.isFunction(serviceLoader.multi)
    assert.isFunction(serviceLoader.exec)
    assert.isFunction(serviceLoader.clear)
  })

  it('takes a cacheParamsFn option', () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts',
      cacheParamsFn: testFunc
    })
    assert.deepEqual(serviceLoader.options.cacheParamsFn, testFunc)
  })

  it('passes loader options', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts',
      cacheKeyFn: testFunc
    })
    await serviceLoader.load(1)
    const [dataLoader] = serviceLoader.loaders.values()
    assert.deepEqual(dataLoader._cacheKeyFn, testFunc)
  })

  it('works with load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.load(1)
    assert.deepEqual(result, defaultResult)
  })

  it('works with load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await Promise.all([app.service('posts').get(1), app.service('posts').get(2)])
    const result = await serviceLoader.load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body').load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with key("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.key('body')._load('John post')
    assert.deepEqual(result, defaultResult)
  })

  it('works with multi("key").load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'comments'
    })
    const result = await serviceLoader.multi('postId').load(1)
    assert.deepEqual(result.length, 3)
  })

  it('works with multi("key")._load(id)', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'comments'
    })
    const result = await serviceLoader.multi('postId')._load(1)
    assert.deepEqual(result.length, 3)
  })

  it('works with multi("key").load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'comments'
    })
    const defaultResult = await Promise.all([
      app.service('comments').find({ paginate: false, query: { postId: 1 } }),
      app.service('comments').find({ paginate: false, query: { postId: 2 } })
    ])
    const result = await serviceLoader.multi('postId').load([1, 2])
    assert.deepEqual(result, defaultResult)
  })

  it('works with select(selection).load()', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const mainResult = await app.service('posts').get(1)
    const defaultResult = await serviceLoader.load(1)
    const selectedResult = await serviceLoader.select(['body']).load(1)

    assert.deepEqual(selectedResult, {
      id: defaultResult.id,
      body: defaultResult.body
    })
    assert.deepEqual(mainResult, defaultResult)
    assert.deepEqual(serviceLoader.cacheMap.size, 1)
  })

  it('works with select(selection).get()', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const mainResult = await app.service('posts').get(1)
    const defaultResult = await serviceLoader.get(1)
    const selectedResult = await serviceLoader.select(['body']).get(1)

    assert.deepEqual(selectedResult, {
      id: defaultResult.id,
      body: defaultResult.body
    })
    assert.deepEqual(mainResult, defaultResult)
    assert.deepEqual(serviceLoader.cacheMap.size, 1)
  })

  it('works with select(selection).find()', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const mainResult = await app.service('posts').find()
    const defaultResult = await serviceLoader.find()
    const selectedResult = await serviceLoader.select(['body']).find()

    assert.deepEqual(
      selectedResult,
      defaultResult.map((result) => {
        return {
          id: result.id,
          body: result.body
        }
      })
    )
    assert.deepEqual(mainResult, defaultResult)
    assert.deepEqual(serviceLoader.cacheMap.size, 1)
  })

  it('works with select(selection).load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const mainResult = await app.service('posts').find({
      paginate: false,
      query: {
        id: { $in: [1, 2] },
        $sort: { id: 1 }
      }
    })
    const defaultResult = await serviceLoader.load([1, 2])
    const selectedResult = await serviceLoader.select(['body']).load([1, 2])

    assert.deepEqual(
      selectedResult,
      defaultResult.map((result) => {
        return {
          id: result.id,
          body: result.body
        }
      })
    )
    assert.deepEqual(mainResult, defaultResult)
    assert.deepEqual(serviceLoader.cacheMap.size, 1)
  })

  it('works with select(selection).multi(key).load([id1, id2])', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'comments'
    })
    const result1 = await app.service('comments').find({
      paginate: false,
      query: { postId: 1 }
    })
    const result2 = await app.service('comments').find({
      paginate: false,
      query: { postId: 2 }
    })
    const mainResult = [result1, result2]
    const defaultResult = await serviceLoader.multi('postId').load([1, 2])
    const selectedResult = await serviceLoader.multi('postId').select(['text']).load([1, 2])

    assert.deepEqual(
      selectedResult,
      defaultResult.map((result) => {
        return result.map((result) => {
          return {
            postId: result.postId,
            text: result.text
          }
        })
      })
    )
    assert.deepEqual(mainResult, defaultResult)
    assert.deepEqual(serviceLoader.cacheMap.size, 1)
  })

  it('works with get', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await app.service('posts').get(1)
    const result = await serviceLoader.get(1)
    assert.deepEqual(result, defaultResult)
  })

  it('works with find', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
    })
    const defaultResult = await app.service('posts').find()
    const result = await serviceLoader.find()
    assert.deepEqual(result, defaultResult)
  })

  it('works with underscored methods', async () => {
    const serviceLoader = new ServiceLoader({
      app,
      service: 'posts'
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
      service: 'posts',
      cacheMap: cacheMap
    })
    const commentsLoader = new ServiceLoader({
      app,
      service: 'comments',
      cacheMap: cacheMap
    })

    await commentsLoader.load(1)

    await postsLoader.load(1)
    await postsLoader.get(1)
    await postsLoader.find()

    await postsLoader.clear()

    assert.deepEqual(cacheMap.size, 1)
    assert.deepEqual(postsLoader.loaders.size, 0)
  })
})
