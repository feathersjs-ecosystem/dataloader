const { assert } = require('chai')
const { AppLoader } = require('../src')
const { makeApp } = require('./utils')

const testFunc = () => {}

class TestLoader {
  findOne() {}
}

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

  it('returns a cached ServiceLoader', () => {
    const appLoader = new AppLoader({ app })
    const serviceLoader1 = appLoader.service('posts')
    const serviceLoader2 = appLoader.service('posts')
    assert.deepEqual(serviceLoader1, serviceLoader2)
  })

  it('passes service options', () => {
    const appLoader = new AppLoader({
      app,
      services: {
        posts: {
          cacheParamsFn: testFunc
        }
      }
    })
    const serviceLoader = appLoader.service('posts')
    assert.deepEqual(serviceLoader.options.cacheParamsFn, testFunc)
  })

  it('passes default options', () => {
    const appLoader = new AppLoader({
      app,
      cacheParamsFn: testFunc
    })
    const serviceLoader = appLoader.service('posts')
    assert.deepEqual(serviceLoader.options.cacheParamsFn, testFunc)
  })

  it('clears all loaders', async () => {
    const appLoader = new AppLoader({
      app,
      services: {
        posts: { cacheMap: new Map() },
        comments: { cacheMap: new Map() }
      }
    })
    const postsLoader = appLoader.service('posts')
    const commentsLoader = appLoader.service('comments')
    await postsLoader.load(1)
    await commentsLoader.load(1)
    assert.deepEqual(appLoader.options.loaders.size, 2)
    assert.deepEqual(postsLoader.options.cacheMap.size, 1)
    assert.deepEqual(commentsLoader.options.cacheMap.size, 1)
    await appLoader.clear()
    assert.deepEqual(appLoader.options.loaders.size, 0)
    assert.deepEqual(postsLoader.options.cacheMap.size, 0)
    assert.deepEqual(commentsLoader.options.cacheMap.size, 0)
  })

  it('takes a base class in global config', () => {
    const appLoader = new AppLoader({ app, ServiceLoader: TestLoader })
    const serviceLoader = appLoader.service('posts')
    assert.isFunction(serviceLoader.findOne)
  })

  it('takes a base class in service config', () => {
    const appLoader = new AppLoader({
      app,
      services: {
        posts: { ServiceLoader: TestLoader }
      }
    })
    const serviceLoader = appLoader.service('posts')
    assert.isFunction(serviceLoader.findOne)
  })
})
