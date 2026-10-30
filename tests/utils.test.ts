import { describe, it, expect } from 'vitest'
import {
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  stableStringify,
  defaultCacheKeyFn
} from '../src/utils.js'

describe('utils.test', () => {
  it('uniqueKeys dedupes keys', () => {
    const keys = [1, 1, 2, 2]
    const newKeys = uniqueKeys(keys)
    expect(newKeys).toEqual([1, 2])
  })

  it('uniqueKeys handles prototype names and preserves string-based comparisons', () => {
    const keys = ['constructor', 1, '1', '__proto__', 'constructor', 'toString', 1]
    expect(uniqueKeys(keys)).toEqual(['constructor', 1, '__proto__', 'toString'])
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'uniqueResults maps %s without inherited entries',
    (key) => {
      const record = { id: key }
      expect(uniqueResults([key], [])).toEqual([null])
      expect(uniqueResults([key, 'missing', key], [record])).toEqual([record, null, record])
    }
  )

  it.each(['constructor', 'toString', '__proto__'])(
    'uniqueResultsMulti groups %s without inherited entries',
    (key) => {
      const records = [
        { id: key, value: 1 },
        { id: key, value: 2 }
      ]
      expect(uniqueResultsMulti([key], [])).toEqual([null])
      expect(uniqueResultsMulti([key, 'missing', key], records)).toEqual([records, null, records])
    }
  )

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

  it('uniqueResults supports dot notation keys', () => {
    const keys = [1, 2]
    const results = [
      { nested: { id: 1 }, name: 'a' },
      { nested: { id: 2 }, name: 'b' }
    ]
    const newResults = uniqueResults(keys, results, 'nested.id')
    expect(newResults).toEqual([
      { nested: { id: 1 }, name: 'a' },
      { nested: { id: 2 }, name: 'b' }
    ])
  })

  it('uniqueResults supports deeply nested dot notation keys', () => {
    const keys = ['x', 'y']
    const results = [
      { a: { b: { c: 'x' } }, val: 1 },
      { a: { b: { c: 'y' } }, val: 2 }
    ]
    const newResults = uniqueResults(keys, results, 'a.b.c')
    expect(newResults).toEqual([
      { a: { b: { c: 'x' } }, val: 1 },
      { a: { b: { c: 'y' } }, val: 2 }
    ])
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

  it('uniqueResultsMulti supports dot notation keys', () => {
    const keys = [1, 2]
    const results = [
      { nested: { id: 1 }, name: 'a' },
      { nested: { id: 1 }, name: 'b' },
      { nested: { id: 2 }, name: 'c' }
    ]
    const newResults = uniqueResultsMulti(keys, results, 'nested.id')
    expect(newResults).toEqual([
      [
        { nested: { id: 1 }, name: 'a' },
        { nested: { id: 1 }, name: 'b' }
      ],
      [{ nested: { id: 2 }, name: 'c' }]
    ])
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

  it('stableStringify preserves an own __proto__ property', () => {
    const value = JSON.parse('{"z":2,"__proto__":{"value":1},"a":3}')
    expect(stableStringify(value)).toBe('{"__proto__":{"value":1},"a":3,"z":2}')
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
    expect(defaultCacheKeyFn(0)).toBe(0)
    expect(defaultCacheKeyFn('')).toBe('')
  })
})
