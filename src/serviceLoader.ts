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
export interface ServiceLoaderOptions extends Omit<DataLoader.Options<unknown, unknown>, 'cacheMap'> {
  app: Pick<Application, 'service'>
  serviceName: string
}

interface LoaderState {
  key?: string
  multi?: boolean
}

interface ExecOptions extends LoaderState {
  id?: unknown
  params?: Params
  method?: LoadMethod
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
  key: string
  cacheParamsFn: InternalCacheParamsFn
  loaderOptions: DataLoader.Options<unknown, unknown>
  loaders: Map<string, DataLoader<unknown, unknown>>
  cacheMap: Map<string, Promise<unknown>>
}

interface CreateDataLoaderOptions {
  service: LoaderService
  key: string
  loaderOptions: DataLoader.Options<unknown, unknown>
  multi: boolean
  method: LoadMethod
  params: Params
}

const filters = ['$skip', '$sort', '$limit']

let nextCacheParamsScope = 0

class CacheReference {
  constructor(readonly reference: string) {}
}

const createDataLoader = ({
  service,
  key,
  loaderOptions,
  multi,
  method,
  params
}: CreateDataLoaderOptions) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'
  const methodFn = service[serviceMethod]
  if (!methodFn) {
    throw new GeneralError(
      `Cannot create a loader for a service that does not have a ${serviceMethod} method.`
    )
  }
  const getResults = multi ? uniqueResultsMulti : uniqueResults
  return new DataLoader(async (keys: readonly unknown[]) => {
    const query = { ...params.query, [key]: { $in: uniqueKeys([...keys]) } }
    const result = await methodFn.call(service, { ...params, paginate: false, query })
    return getResults([...keys], result, key)
  }, loaderOptions)
}

const stringifyKey = (options: ExecOptions, cacheParamsFn: InternalCacheParamsFn): string => {
  return stableStringify({ ...options, params: cacheParamsFn(options.params) })
}

const createDefaultCacheParamsFn = (): InternalCacheParamsFn => {
  const enumerableKeys = (value: object): PropertyKey[] => {
    return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
  }

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

  constructor(options: ServiceLoaderOptions | ServiceLoader, state?: LoaderState) {
    this.state = state || {}

    if (options instanceof ServiceLoader) {
      this.options = options.options
      return
    }

    const { app, serviceName, ...loaderOptions } = options
    const service = app.service(serviceName) as LoaderService
    this.options = {
      app,
      service,
      key: (service.options && service.options.id) || 'id',
      cacheParamsFn: createDefaultCacheParamsFn(),
      loaderOptions: _.assign(
        { cacheKeyFn: defaultCacheKeyFn },
        _.omit(loaderOptions, ['cacheMap', 'cacheParamsFn'])
      ),
      loaders: new Map(),
      cacheMap: new Map()
    }
  }

  async exec(opts: ExecOptions = {}): Promise<unknown> {
    const { service, loaderOptions, cacheParamsFn, cacheMap, loaders } = this.options

    const execOptions = _.assign(
      {
        id: null as unknown,
        key: this.options.key,
        params: {},
        multi: false,
        method: 'load' as LoadMethod
      },
      _.omit(opts, ['cacheParamsFn'])
    )

    if (execOptions.params.query && _.has(execOptions.params.query, filters)) {
      throw new GeneralError(`Loader load methods cannot contain ${filters.join(', ')} in the query`)
    }

    if (Array.isArray(execOptions.id)) {
      execOptions.id = [...execOptions.id].sort()
    }

    const cacheKey = stringifyKey(execOptions, cacheParamsFn)

    const cachedPromise = cacheMap.get(cacheKey)

    if (cachedPromise) {
      return cachedPromise
    }

    const loaderConfig = _.pick(execOptions, ['key', 'multi', 'method', 'params'])

    const loaderKey = stringifyKey(loaderConfig, cacheParamsFn)

    let dataLoader = loaders.get(loaderKey)

    if (!dataLoader) {
      dataLoader = createDataLoader({
        service,
        loaderOptions,
        ...loaderConfig
      })

      loaders.set(loaderKey, dataLoader)
    }

    const promise = Array.isArray(execOptions.id)
      ? dataLoader.loadMany(execOptions.id)
      : dataLoader.load(execOptions.id)

    cacheMap.set(cacheKey, promise)

    const evict = () => {
      if (cacheMap.get(cacheKey) === promise) {
        cacheMap.delete(cacheKey)
      }
    }

    try {
      const result = await promise
      if (
        Array.isArray(execOptions.id) &&
        Array.isArray(result) &&
        result.some((item) => item instanceof Error)
      ) {
        evict()
      }
      return result
    } catch (error) {
      evict()
      throw error
    }
  }

  load(id: unknown, params?: Params): Promise<unknown> {
    return this.exec({ ...this.state, method: 'load', id, params })
  }

  _load(id: unknown, params?: Params): Promise<unknown> {
    return this.exec({ ...this.state, method: '_load', id, params })
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
    const { loaders, cacheMap } = this.options
    loaders.clear()
    cacheMap.clear()
    return this
  }
}
