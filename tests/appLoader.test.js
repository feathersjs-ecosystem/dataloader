const { assert } = require('chai')
const { AppLoader } = require('../src')
const { makeApp } = require('./utils')

const testFunc = () => {}

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
    assert.isFunction(serviceLoader.multi)
    assert.isFunction(serviceLoader.key)
    assert.isFunction(serviceLoader.exec)
    assert.isFunction(serviceLoader.clear)
    assert.isFunction(serviceLoader.stringifyKey)
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

  it('clears all loaders', () => {
    const appLoader = new AppLoader({ app })
    appLoader.service('posts')
    appLoader.service('comments')
    appLoader.clear()
    assert.deepEqual(appLoader.loaders.size, 0)
  })

  it('takes a base class', () => {
    class MyLoader {
      findOne() {}
    }

    const appLoader = new AppLoader({ app, ServiceLoader: MyLoader })
    const serviceLoader = appLoader.service('posts')
    assert.isFunction(serviceLoader.findOne)
  })
})
