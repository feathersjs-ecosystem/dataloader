import { describe, it, expect } from 'vitest'
import {
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  stableStringify,
  defaultCacheParamsFn,
  defaultCacheKeyFn
} from './utils.js'

describe('utils.test', () => {
  it('uniqueKeys dedupes keys', () => {
    const keys = [1, 1, 2, 2]
    const newKeys = uniqueKeys(keys)
    expect(newKeys).toEqual([1, 2])
  })

  it('uniqueResults returns proper number of results', () => {
    const keys = [1, 2]
    const results = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const newResults = uniqueResults(keys, results)
    expect(newResults).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('uniqueResults returns results in proper order', () => {
    const keys = [1, 2]
    const results = [{ id: 2 }, { id: 1 }]
    const newResults = uniqueResults(keys, results)
    expect(newResults).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('uniqueResults returns a default value', () => {
    const keys = [1, 2, 3]
    const results = [{ id: 1 }, { id: 2 }]
    const newResults = uniqueResults(keys, results)
    expect(newResults).toEqual([{ id: 1 }, { id: 2 }, null])
  })

  it('uniqueResultsMulti returns proper number of results', () => {
    const keys = [1, 2]
    const results = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const newResults = uniqueResultsMulti(keys, results)
    expect(newResults).toEqual([[{ id: 1 }], [{ id: 2 }]])
  })

  it('uniqueResultsMulti returns results in the proper order', () => {
    const keys = [1, 2]
    const results = [{ id: 2 }, { id: 1 }]
    const newResults = uniqueResultsMulti(keys, results)
    expect(newResults).toEqual([[{ id: 1 }], [{ id: 2 }]])
  })

  it('uniqueResultsMulti returns a default value', () => {
    const keys = [1, 2, 3]
    const results = [{ id: 1 }, { id: 2 }]
    const newResults = uniqueResultsMulti(keys, results)
    expect(newResults).toEqual([[{ id: 1 }], [{ id: 2 }], null])
  })

  it('stableStringify returns a consistent result', () => {
    const params1 = stableStringify({
      id: 1,
      array: [
        { id: 1, param: true },
        { param: true, id: 2 }
      ]
    })
    const params2 = stableStringify({
      array: [
        { param: true, id: 1 },
        { id: 2, param: true }
      ],
      id: 1
    })
    expect(params1).toEqual(params2)
  })

  it('stableStringify throws with a function param', () => {
    const fn = () => stableStringify({ func: () => {} })
    expect(fn).toThrow()
  })

  it('defaultCacheKeyFn coerces things to string', () => {
    const _id = {
      toString() {
        return '1'
      }
    }

    expect(defaultCacheKeyFn(1)).toEqual('1')
    expect(defaultCacheKeyFn('1')).toEqual('1')
    expect(defaultCacheKeyFn(_id)).toEqual('1')
  })

  it('defaultCacheParamsFn only returns valid props', () => {
    const safeParams = {
      provider: 'rest',
      authentication: { prop: 1 },
      user: { prop: 1 },
      query: { prop: 1 }
    }
    const params = {
      ...safeParams,
      otherProp: 'otherProp'
    }
    const cacheParams = defaultCacheParamsFn(params)
    expect(cacheParams).toEqual(safeParams)
  })
})
