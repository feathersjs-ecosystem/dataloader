import { GeneralError } from '@feathersjs/errors'
import DataLoader from 'dataloader'
import {
  stableStringify,
  defaultCacheParamsFn,
  defaultCacheKeyFn,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  Params,
  CacheParamsFn,
  ResultWithId
} from './utils.js'
import type { Application, Service } from '@feathersjs/feathers'

/** Available loader methods */
export type LoadMethod = 'get' | '_get' | 'find' | '_find' | 'load' | '_load'

/**
 * Interface for cache storage implementations.
 * Compatible with Map and async cache stores like Redis.
 */
export interface CacheMap<K = string, V = unknown> {
  get(key: K): V | undefined | Promise<V | undefined>
  set(key: K, value: V): unknown
  delete(key: K): unknown
  clear(): unknown
  keys(): Iterable<K> | AsyncIterable<K>
}

/** Options for configuring a ServiceLoader instance */
export interface ServiceLoaderOptions {
  /** The Feathers application instance */
  app: Application
  /** Name of the service to load from */
  serviceName: string
  /** Custom function to extract cache-relevant params */
  cacheParamsFn?: CacheParamsFn
  /** Custom cache storage implementation */
  cacheMap?: CacheMap
  /** Custom function to generate cache keys */
  cacheKeyFn?: (key: unknown) => string
  [key: string]: unknown
}

interface CreateDataLoaderOptions {
  service: Service
  key: string
  loaderOptions: DataLoader.Options<unknown, unknown>
  multi: boolean
  method: LoadMethod
  params?: Params
}

interface ExecOptions {
  id?: unknown
  key?: string
  params?: Params
  multi?: boolean
  method?: LoadMethod
  cacheParamsFn?: CacheParamsFn
}

/** Methods returned by key() and multi() for chained loading */
interface KeyLoadMethods {
  load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => Promise<unknown>
  _load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => Promise<unknown>
}

/** Service method signature for find/get operations */
type ServiceMethod = (arg1?: unknown, arg2?: unknown) => Promise<unknown>

/** Service with optional method implementations */
interface ServiceWithMethods {
  find?: ServiceMethod
  _find?: ServiceMethod
  get?: ServiceMethod
  _get?: ServiceMethod
  [key: string]: ServiceMethod | unknown
}

/** Service with options property for accessing service configuration */
interface ServiceWithOptions {
  options?: {
    id?: string
  }
}

const createDataLoader = ({
  service,
  key,
  loaderOptions,
  multi,
  method,
  params = {}
}: CreateDataLoaderOptions) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'

  const serviceWithMethod = service as unknown as ServiceWithMethods

  const methodFn = serviceWithMethod[serviceMethod] as ServiceMethod | undefined
  if (!methodFn) {
    throw new GeneralError(
      `Cannot create a loader for a service that does not have a ${serviceMethod} method.`
    )
  }

  const getResults = multi ? uniqueResultsMulti : uniqueResults

  return new DataLoader(async (keys: readonly unknown[]) => {
    const loaderParams: Params = {
      ...params,
      paginate: false,
      query: {
        ...params.query,
        [key]: { $in: uniqueKeys([...keys]) }
      }
    }
    if (loaderParams.query) {
      delete loaderParams.query['$limit']
    }
    const result = await methodFn.call(service, loaderParams)
    return getResults([...keys], result as ResultWithId[], key)
  }, loaderOptions)
}

/**
 * Loader for a single Feathers service that batches and caches requests.
 */
export class ServiceLoader {
  cacheMap: CacheMap
  loaders: Map<string, DataLoader<unknown, unknown>>
  options: {
    app: Application
    serviceName: string
    service: Service
    key: string
    cacheParamsFn: CacheParamsFn
    loaderOptions: DataLoader.Options<unknown, unknown>
  }

  constructor({ app, serviceName, cacheParamsFn, cacheMap, ...loaderOptions }: ServiceLoaderOptions) {
    this.cacheMap = cacheMap || (new Map() as CacheMap)
    this.loaders = new Map()
    const service = app.service(serviceName)
    const serviceWithOptions = service as unknown as ServiceWithOptions
    const serviceOptions = serviceWithOptions.options
    this.options = {
      app,
      serviceName,
      service,
      key: (serviceOptions && serviceOptions.id) || 'id',
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: {
        cacheKeyFn: defaultCacheKeyFn,
        ...loaderOptions
      }
    }
  }

  async exec({ cacheParamsFn, ...options }: ExecOptions = {}): Promise<unknown> {
    const { service, loaderOptions } = this.options

    const execOptions = {
      id: null as unknown,
      key: this.options.key,
      params: undefined as Params | undefined,
      multi: false,
      method: 'load' as LoadMethod,
      ...options
    }

    const serviceWithMethod = service as unknown as ServiceWithMethods

    if (['get', '_get', 'find', '_find'].includes(execOptions.method)) {
      const cacheKey = this.stringifyKey(execOptions, cacheParamsFn)

      const cachedResult = await this.cacheMap.get(cacheKey)

      if (cachedResult) {
        return cachedResult
      }

      const methodFn = serviceWithMethod[execOptions.method] as ServiceMethod
      const result = ['get', '_get'].includes(execOptions.method)
        ? await methodFn.call(service, execOptions.id, execOptions.params)
        : await methodFn.call(service, execOptions.params)

      await this.cacheMap.set(cacheKey, result)

      return result
    }

    const sortedId = Array.isArray(execOptions.id) ? [...execOptions.id].sort() : execOptions.id

    const cacheKey = this.stringifyKey(
      {
        ...execOptions,
        id: sortedId
      },
      cacheParamsFn
    )

    const cachedResult = await this.cacheMap.get(cacheKey)

    if (cachedResult) {
      return cachedResult
    }

    const loaderKey = this.stringifyKey(
      {
        key: execOptions.key,
        multi: execOptions.multi,
        method: execOptions.method,
        params: execOptions.params
      },
      cacheParamsFn
    )

    const dataLoader =
      this.loaders.get(loaderKey) ||
      createDataLoader({
        key: execOptions.key,
        multi: execOptions.multi,
        method: execOptions.method,
        params: execOptions.params,
        service,
        loaderOptions
      })

    this.loaders.set(loaderKey, dataLoader)

    const result = Array.isArray(sortedId)
      ? await dataLoader.loadMany(sortedId)
      : await dataLoader.load(sortedId)

    await this.cacheMap.set(cacheKey, result)

    return result
  }

  get(id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: 'get', id, params, cacheParamsFn })
  }

  _get(id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: '_get', id, params, cacheParamsFn })
  }

  find(params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: 'find', params, cacheParamsFn })
  }

  _find(params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: '_find', params, cacheParamsFn })
  }

  load(id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: 'load', id, params, cacheParamsFn })
  }

  _load(id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn): Promise<unknown> {
    return this.exec({ method: '_load', id, params, cacheParamsFn })
  }

  key(key: string): KeyLoadMethods {
    return {
      load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => {
        return this.exec({
          method: 'load',
          id,
          key,
          params,
          cacheParamsFn
        })
      },
      _load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => {
        return this.exec({
          method: '_load',
          id,
          key,
          params,
          cacheParamsFn
        })
      }
    }
  }

  multi(key: string): KeyLoadMethods {
    return {
      load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => {
        return this.exec({
          method: 'load',
          id,
          key,
          params,
          cacheParamsFn,
          multi: true
        })
      },
      _load: (id: unknown, params?: Params, cacheParamsFn?: CacheParamsFn) => {
        return this.exec({
          method: '_load',
          id,
          key,
          params,
          cacheParamsFn,
          multi: true
        })
      }
    }
  }

  stringifyKey(options: ExecOptions, cacheParamsFn: CacheParamsFn = this.options.cacheParamsFn): string {
    return stableStringify({
      ...options,
      serviceName: this.options.serviceName,
      params: cacheParamsFn(options.params)
    })
  }

  async clear(): Promise<this> {
    const { serviceName } = this.options
    this.loaders.clear()
    const promises: Promise<unknown>[] = []
    for await (const cacheKey of this.cacheMap.keys()) {
      const parsedKey = JSON.parse(cacheKey as string) as { serviceName?: string }
      if (parsedKey.serviceName === serviceName) {
        promises.push(Promise.resolve(this.cacheMap.delete(cacheKey)))
      }
    }
    await Promise.all(promises)
    return this
  }
}
