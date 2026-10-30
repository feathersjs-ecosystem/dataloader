import { GeneralError } from '@feathersjs/errors'

/** Feathers service call parameters */
export interface Params {
  /** Transport provider (rest, socketio, etc.) */
  provider?: string
  /** Authentication information */
  authentication?: unknown
  /** Authenticated user */
  user?: unknown
  /** Query parameters */
  query?: Record<string, unknown> | null
  [key: string]: unknown
}

const isObject = (obj: unknown): obj is Record<string, unknown> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }
  return Object.getPrototypeOf(obj) === Object.prototype
}

export const _ = {
  isObject,
  assign: <T extends object, U extends object>(target: T, source: U): T & U => {
    const result = { ...target } as Record<string, unknown>
    const values = source as Record<string, unknown>
    for (const key of Object.keys(source)) {
      if (values[key] !== undefined) {
        result[key] = values[key]
      }
    }
    return result as T & U
  },
  omit: <T extends object, const K extends PropertyKey>(source: T, keys: readonly K[]): Omit<T, K> => {
    const result = { ...source } as Record<PropertyKey, unknown>
    for (const key of keys) {
      delete result[key]
    }
    return result as Omit<T, K>
  },
  pick: <T extends object, const K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> => {
    const result = {} as Pick<T, K>
    for (const key of keys) {
      if (source[key] !== undefined) {
        result[key] = source[key]
      }
    }
    return result
  },
  has: (source: object, keys: readonly PropertyKey[]): boolean => {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key))
  }
}

/**
 * Get a value from an object using dot notation path.
 * e.g., getByDotPath(obj, 'foo.bar.baz') returns obj.foo.bar.baz
 */
const getByDotPath = (obj: Record<string, unknown>, path: string): unknown => {
  const parts = path.split('.')
  let current: unknown = obj
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = (current as Record<string, unknown>)[parts[i]!]
  }
  return current
}

/**
 * Stringify an object with consistent key ordering for cache keys.
 * @throws GeneralError if object contains functions
 */
export const stableStringify = (object: unknown): string => {
  return JSON.stringify(object, (_key, value: unknown) => {
    if (typeof value === 'function') {
      throw new GeneralError(
        'Cannot stringify non JSON value. The object passed to stableStringify must be serializable.'
      )
    }

    if (_.isObject(value)) {
      const keys = Object.keys(value).sort()
      return Object.fromEntries(keys.map((key) => [key, value[key]]))
    }

    return value
  })
}

/**
 * Default function to convert IDs to cache key strings.
 */
export const defaultCacheKeyFn = (id: unknown): unknown => {
  if (!id) {
    return id
  }
  const idWithToString = id as { toString?: () => string }
  return idWithToString.toString ? idWithToString.toString() : String(id)
}

/**
 * Remove duplicate keys from an array while preserving order.
 */
export const uniqueKeys = <T>(keys: T[]): T[] => {
  const found = new Map<string, T>()

  for (let index = 0, length = keys.length; index < length; ++index) {
    const key = keys[index]!
    const keyStr = String(key)
    if (!found.has(keyStr)) {
      found.set(keyStr, key)
    }
  }

  return [...found.values()]
}

/** Object with indexable properties for result mapping */
export interface ResultWithId {
  [key: string]: unknown
}

/** Service result - either an array or paginated object with data */
export type ServiceResult<T> = T[] | { data: T[] }

/**
 * Map service results back to requested keys in order.
 * Returns one result per key.
 */
export const uniqueResults = <T extends ResultWithId, K>(
  keys: K[],
  result: ServiceResult<T>,
  key: string = 'id',
  defaultValue: T | null = null
): (T | null)[] => {
  const serviceResults = 'data' in result ? result.data : result
  const found = new Map<string, T>()
  const results: (T | null)[] = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const item = serviceResults[index]!
    const id = String(getByDotPath(item, key))
    found.set(id, item)
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found.get(String(keys[index])) ?? defaultValue)
  }

  return results
}

/**
 * Map service results back to requested keys in order.
 * Returns array of all matching results per key.
 */
export const uniqueResultsMulti = <T extends ResultWithId, K>(
  keys: K[],
  result: ServiceResult<T>,
  key: string = 'id',
  defaultValue: T[] | null = null
): (T[] | null)[] => {
  const serviceResults = 'data' in result ? result.data : result
  const found = new Map<string, T[]>()
  const results: (T[] | null)[] = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const item = serviceResults[index]!
    const id = String(getByDotPath(item, key))
    const group = found.get(id)
    if (group) {
      group.push(item)
    } else {
      found.set(id, [item])
    }
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found.get(String(keys[index])) ?? defaultValue)
  }

  return results
}
