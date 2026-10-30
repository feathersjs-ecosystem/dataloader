import { GeneralError } from '@feathersjs/errors'
import DataLoader from 'dataloader'
import {
  stableStringify,
  defaultCacheKeyFn,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  _
} from './utils.js'
import type { Application } from '@feathersjs/feathers'
import type { Params, ResultWithId, ServiceResult } from './utils.js'

export type LoadMethod = 'load' | '_load'

/** Options shared by all batches belonging to a service loader. */
export interface ServiceLoaderOptions {
  app: Pick<Application, 'service'>
  serviceName: string
  key?: string
  maxBatchSize?: number
}

interface LoaderState {
  key: string
  multi: boolean
}

interface ExecOptions extends LoaderState {
  value: unknown
  params?: Params
  method: LoadMethod
}

type InternalCacheParamsFn = (params?: Params | null) => string

type FindMethod = (params: Params) => Promise<ServiceResult<ResultWithId>>
interface LoaderService {
  options?: { id?: string }
  find?: FindMethod
  _find?: FindMethod
}

interface SharedLoaderOptions {
  app: ServiceLoaderOptions['app']
  service: LoaderService
  cacheParamsFn: InternalCacheParamsFn
  maxBatchSize?: number
  loaders: Map<string, DataLoader<unknown, unknown>>
}

interface CreateDataLoaderOptions {
  service: LoaderService
  key: string
  maxBatchSize?: number
  multi: boolean
  method: LoadMethod
  params?: Params
}

const filters = ['$skip', '$sort', '$limit']

let nextCacheParamsScope = 0

class CacheReference {
  constructor(readonly reference: string) {}
}

const enumerableKeys = (value: object): PropertyKey[] => {
  return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
}

const cloneParams = <T>(value: T, seen = new WeakMap<object, object>()): T => {
  if (value === null || typeof value !== 'object') {
    return value
  }

  const existing = seen.get(value)
  if (existing) {
    return existing as T
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime())
    seen.set(value, copy)
    return copy as T
  }

  if (!Array.isArray(value) && !_.isObject(value) && Object.getPrototypeOf(value) !== null) {
    return value
  }

  const copy: object = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value))

  seen.set(value, copy)

  for (const key of enumerableKeys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneParams((value as Record<PropertyKey, unknown>)[key], seen),
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
  return copy as T
}

const createDataLoader = ({ service, key, maxBatchSize, multi, method, params }: CreateDataLoaderOptions) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'
  const methodFn = service[serviceMethod]
  if (!methodFn) {
    throw new GeneralError(
      `Cannot create a loader for a service that does not have a ${serviceMethod} method.`
    )
  }
  // Clone the params in case the caller mutates them after creating the loader
  const paramsSnapshot = cloneParams(params)
  const getResults = multi ? uniqueResultsMulti : uniqueResults
  return new DataLoader<unknown, unknown>(
    async (values: readonly unknown[]) => {
      // Clone again in case the methodFn mutates the params
      const batchParams = cloneParams(paramsSnapshot)
      const query = { ...batchParams?.query, [key]: { $in: uniqueKeys([...values]) } }
      const result = await methodFn.call(service, { ...batchParams, paginate: false, query })
      return getResults([...values], result, key)
    },
    { maxBatchSize, cacheKeyFn: defaultCacheKeyFn }
  )
}

const stringifyKey = (options: Omit<ExecOptions, 'value'>, cacheParamsFn: InternalCacheParamsFn): string => {
  return stableStringify({ ...options, params: cacheParamsFn(options.params) })
}

const createDefaultCacheParamsFn = (): InternalCacheParamsFn => {
  // The extra encoder is protecting distinctions that ordinary JSON loses: undefined versus missing properties,
  // NaN versus null, symbols, bigint, and generated tokens versus similarly shaped user data.
  const encodeCacheValue = (value: unknown, reference: (value: unknown) => CacheReference): unknown[] => {
    if (value instanceof CacheReference) {
      return ['reference', value.reference]
    }

    if (value === null) {
      return ['null']
    }

    const type = typeof value

    if (type === 'symbol') {
      return ['symbol', reference(value).reference]
    }

    if (type === 'undefined') {
      return ['undefined']
    }

    if (type === 'number' || type === 'bigint') {
      return [type, Object.is(value, -0) ? '-0' : String(value)]
    }

    if (type === 'string' || type === 'boolean') {
      return [type, value]
    }

    if (value instanceof Date) {
      return ['date', String(value.getTime())]
    }

    if (Array.isArray(value)) {
      return [
        'array',
        Array.from({ length: value.length }, (_value, index) => {
          return _.has(value, [index]) ? encodeCacheValue(value[index], reference) : ['hole']
        })
      ]
    }

    const object = value as Record<PropertyKey, unknown>
    const entries = enumerableKeys(object).map((key) => {
      return [encodeCacheValue(key, reference), encodeCacheValue(object[key], reference)]
    })

    entries.sort((first, second) => {
      const firstKey = JSON.stringify(first[0])!
      const secondKey = JSON.stringify(second[0])!
      return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0
    })

    return ['object', entries]
  }

  const scope = nextCacheParamsScope++
  const references = new Map<unknown, CacheReference>()
  const ignoredLoader = Symbol('ignored loader')

  const reference = (value: unknown): CacheReference => {
    if (!references.has(value)) {
      references.set(value, new CacheReference(`${scope}:${references.size}`))
    }

    return references.get(value)!
  }

  const normalizeObject = (value: object, ancestors: Set<unknown>): Record<PropertyKey, unknown> => {
    const object = value as Record<PropertyKey, unknown>
    const entries: [PropertyKey, unknown][] = []
    for (const key of enumerableKeys(value)) {
      const normalized = normalize(object[key], ancestors)
      if (normalized !== ignoredLoader) {
        entries.push([key, normalized])
      }
    }
    return Object.fromEntries(entries)
  }

  const normalize = (value: unknown, ancestors: Set<unknown>): unknown => {
    if (value instanceof ServiceLoader) {
      return ignoredLoader
    }

    if (typeof value === 'function') {
      return reference(value)
    }

    if (value === null || typeof value !== 'object' || value instanceof Date) {
      return value
    }

    if (ancestors.has(value)) {
      return reference(value)
    }

    ancestors.add(value)

    try {
      if (Array.isArray(value)) {
        return value.map((item) => {
          const normalized = normalize(item, ancestors)
          return normalized === ignoredLoader ? undefined : normalized
        })
      }

      if (_.isObject(value) || Object.getPrototypeOf(value) === null) {
        return normalizeObject(value, ancestors)
      }

      const serializable = value as { toJSON?: () => unknown }
      if (typeof serializable.toJSON === 'function') {
        return normalize(serializable.toJSON(), ancestors)
      }

      return reference(value)
    } catch {
      return reference(value)
    } finally {
      ancestors.delete(value)
    }
  }

  const cacheParamsFn: InternalCacheParamsFn = (params = {}) => {
    const normalized = normalizeObject(params || {}, new Set([params]))
    return JSON.stringify(encodeCacheValue(normalized, reference))
  }

  return cacheParamsFn
}

export class ServiceLoader {
  options: SharedLoaderOptions
  state: LoaderState

  constructor(options: ServiceLoaderOptions | ServiceLoader, state?: Partial<LoaderState>) {
    if (options instanceof ServiceLoader) {
      this.options = options.options
      this.state = _.assign(options.state, state || {})
      return
    }

    const { app, serviceName, key, maxBatchSize } = options
    const service = app.service(serviceName) as LoaderService

    this.state = _.assign(
      {
        key: key ?? (service.options?.id || 'id'),
        multi: false
      },
      state || {}
    )

    this.options = {
      app,
      service,
      cacheParamsFn: createDefaultCacheParamsFn(),
      maxBatchSize,
      loaders: new Map()
    }
  }

  private async exec(opts: ExecOptions): Promise<unknown> {
    const { service, maxBatchSize, cacheParamsFn, loaders } = this.options

    if (opts.params?.query && _.has(opts.params.query, filters)) {
      throw new GeneralError(`Loader load methods cannot contain ${filters.join(', ')} in the query`)
    }

    if (Array.isArray(opts.value)) {
      opts.value = [...opts.value].sort()
    }

    const loaderConfig = _.pick(opts, ['key', 'multi', 'method', 'params'])
    const loaderKey = stringifyKey(loaderConfig, cacheParamsFn)

    let dataLoader = loaders.get(loaderKey)

    if (!dataLoader) {
      dataLoader = createDataLoader({
        service,
        maxBatchSize,
        ...loaderConfig
      })

      loaders.set(loaderKey, dataLoader)
    }

    return Array.isArray(opts.value) ? dataLoader.loadMany(opts.value) : dataLoader.load(opts.value)
  }

  load(value: unknown, params?: Params): Promise<unknown> {
    return this.exec({ ...this.state, method: 'load', value, params })
  }

  _load(value: unknown, params?: Params): Promise<unknown> {
    return this.exec({ ...this.state, method: '_load', value, params })
  }

  key(key: string): this {
    const Loader = this.constructor as typeof ServiceLoader
    return new Loader(this, { ...this.state, key }) as this
  }

  multi(): this {
    const Loader = this.constructor as typeof ServiceLoader
    return new Loader(this, { ...this.state, multi: true }) as this
  }

  clear(): this {
    this.options.loaders.clear()
    this.options.cacheParamsFn = createDefaultCacheParamsFn()
    return this
  }
}
