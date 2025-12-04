import { describe, it, expect } from 'vitest'
import { AppLoader, ServiceLoader, CacheParamsFn } from './index.js'
import { makeApp } from '../tests/utils.js'

const testFunc: CacheParamsFn = () => undefined

class TestLoader extends ServiceLoader {
  findOne() {
    return null
  }
}

describe('appLoader.test', () => {
  const app = makeApp()

  it('creates an AppLoader', () => {
    const appLoader = new AppLoader({ app })
    expect(typeof appLoader.service).toBe('function')
    expect(typeof appLoader.clear).toBe('function')
  })

  it('returns a new ServiceLoader', () => {
    const appLoader = new AppLoader({ app })
    const serviceLoader = appLoader.service('posts')
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

  it('returns a cached ServiceLoader', () => {
    const appLoader = new AppLoader({ app })
    const serviceLoader1 = appLoader.service('posts')
    const serviceLoader2 = appLoader.service('posts')
    expect(serviceLoader1).toEqual(serviceLoader2)
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
    expect(serviceLoader.options.cacheParamsFn).toEqual(testFunc)
  })

  it('passes default options', () => {
    const appLoader = new AppLoader({
      app,
      cacheParamsFn: testFunc
    })
    const serviceLoader = appLoader.service('posts')
    expect(serviceLoader.options.cacheParamsFn).toEqual(testFunc)
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
    await commentsLoader.load(11)
    expect(appLoader.loaders.size).toEqual(2)
    expect((postsLoader.cacheMap as Map<string, unknown>).size).toEqual(1)
    expect((commentsLoader.cacheMap as Map<string, unknown>).size).toEqual(1)
    await appLoader.clear()
    expect(appLoader.loaders.size).toEqual(0)
    expect((postsLoader.cacheMap as Map<string, unknown>).size).toEqual(0)
    expect((commentsLoader.cacheMap as Map<string, unknown>).size).toEqual(0)
  })

  it('takes a base class in global config', () => {
    const appLoader = new AppLoader({ app, ServiceLoader: TestLoader })
    const serviceLoader = appLoader.service('posts') as TestLoader
    expect(typeof serviceLoader.findOne).toBe('function')
  })

  it('takes a base class in service config', () => {
    const appLoader = new AppLoader({
      app,
      services: {
        posts: { ServiceLoader: TestLoader }
      }
    })
    const serviceLoader = appLoader.service('posts') as TestLoader
    expect(typeof serviceLoader.findOne).toBe('function')
  })
})
