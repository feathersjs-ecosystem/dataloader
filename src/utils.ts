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
  query?: Record<string, unknown>
  [key: string]: unknown
}

/** Cache-relevant subset of Params */
export interface CacheParams {
  provider?: string
  authentication?: unknown
  user?: unknown
  query?: Record<string, unknown>
}

/** Function to extract cache-relevant params from full params */
export type CacheParamsFn = (params: Params | undefined) => CacheParams | undefined

const isObject = (obj: unknown): obj is Record<string, unknown> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }
  return Object.getPrototypeOf(obj) === Object.prototype
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

    if (isObject(value)) {
      const keys = Object.keys(value).sort()
      const result: Record<string, unknown> = {}
      for (let index = 0, length = keys.length; index < length; ++index) {
        const key = keys[index]!
        result[key] = value[key]
      }
      return result
    }

    return value
  })
}

/**
 * Default function to extract cache-relevant params.
 * Includes provider, authentication, user, and query.
 */
export const defaultCacheParamsFn: CacheParamsFn = (params) => {
  if (!params) {
    return params
  }
  return {
    provider: params.provider,
    authentication: params.authentication,
    user: params.user,
    query: params.query
  }
}

/**
 * Default function to convert IDs to cache key strings.
 */
export const defaultCacheKeyFn = (id: unknown): string | undefined => {
  if (!id) {
    return undefined
  }
  const idWithToString = id as { toString?: () => string }
  return idWithToString.toString ? idWithToString.toString() : String(id)
}

/**
 * Remove duplicate keys from an array while preserving order.
 */
export const uniqueKeys = <T>(keys: T[]): T[] => {
  const found: Record<string, number> = {}
  const unique: T[] = []

  for (let index = 0, length = keys.length; index < length; ++index) {
    const key = keys[index]!
    const keyStr = String(key)
    if (!found[keyStr]) {
      found[keyStr] = unique.push(key)
    }
  }

  return unique
}

/** Object with indexable properties for result mapping */
export interface ResultWithId {
  [key: string]: unknown
}

/** Service result - either an array or paginated object with data */
export type ServiceResult<T> = T[] | { data: T[] }

/**
 * Map service results back to requested keys in order.
 * Returns one result per key (first match).
 */
export const uniqueResults = <T extends ResultWithId, K>(
  keys: K[],
  result: ServiceResult<T>,
  key: string = 'id',
  defaultValue: T | null = null
): (T | null)[] => {
  const serviceResults = 'data' in result ? result.data : result
  const found: Record<string, T> = {}
  const results: (T | null)[] = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const item = serviceResults[index]!
    const id = String(getByDotPath(item, key))
    found[id] = item
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found[String(keys[index])] || defaultValue)
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
  const found: Record<string, T[]> = {}
  const results: (T[] | null)[] = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const item = serviceResults[index]!
    const id = String(getByDotPath(item, key))
    if (found[id]) {
      found[id].push(item)
    } else {
      found[id] = [item]
    }
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found[String(keys[index])] || defaultValue)
  }

  return results
}
