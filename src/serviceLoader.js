const { GeneralError } = require('@feathersjs/errors')
const DataLoader = require('dataloader')
const {
  stableStringify,
  defaultCacheParamsFn,
  defaultCacheKeyFn,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti
} = require('./utils')

const createDataLoader = ({ service, key, loaderOptions, multi, method, params = {} }) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'

  if (!service[serviceMethod]) {
    throw new GeneralError(
      `Cannot create a loader for a service that does not have a ${serviceMethod} method.`
    )
  }

  const getResults = multi ? uniqueResultsMulti : uniqueResults

  return new DataLoader(async (keys) => {
    return service[serviceMethod]({
      ...params,
      paginate: false,
      query: {
        ...params.query,
        // TODO: Should this be placed in an $and query?
        [key]: { $in: uniqueKeys(keys) }
      }
    }).then((result) => getResults(keys, result, key))
  }, loaderOptions)
}

module.exports = class ServiceLoader {
  constructor({ service, name, cacheParamsFn, cacheMap, ...loaderOptions }) {
    this.cacheMap = cacheMap || new Map()
    this.loaders = new Map()
    this.options = {
      name,
      service,
      key: service.options.id,
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: {
        cacheKeyFn: defaultCacheKeyFn,
        ...loaderOptions
      }
    }
  }

  async exec({ cacheParamsFn, ...options }) {
    const { service, name, loaderOptions } = this.options

    options = {
      id: null,
      key: this.options.key,
      params: null,
      multi: false,
      method: 'load',
      ...options,
      service: name
    }

    if (['get', '_get', 'find', '_find'].includes(options.method)) {
      const cacheKey = this.stringifyKey(options, cacheParamsFn)

      const cachedResult = await this.cacheMap.get(cacheKey)

      if (cachedResult) {
        return cachedResult
      }

      const result = ['get', '_get'].includes(options.method)
        ? await service[options.method](options.id, options.params)
        : await service[options.method](options.params)

      await this.cacheMap.set(cacheKey, result)

      return result
    }

    // stableStringify does not sort arrays on purpose because
    // array order matters in most cases. In this case, the
    // order of ids does not matter to the load function but
    // does to the cache key, thats why these are sorted.
    const sortedId = Array.isArray(options.id) ? [...options.id].sort() : options.id

    const cacheKey = this.stringifyKey(
      {
        ...options,
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
        key: options.key,
        multi: options.multi,
        method: options.method,
        params: options.params,
        service: name
      },
      cacheParamsFn
    )

    const dataLoader =
      this.loaders.get(loaderKey) ||
      createDataLoader({
        key: options.key,
        multi: options.multi,
        method: options.method,
        params: options.params,
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

  get(id, params, cacheParamsFn) {
    return this.exec({ method: 'get', id, params, cacheParamsFn })
  }

  _get(id, params, cacheParamsFn) {
    return this.exec({ method: '_get', id, params, cacheParamsFn })
  }

  find(params, cacheParamsFn) {
    return this.exec({ method: 'find', params, cacheParamsFn })
  }

  _find(params, cacheParamsFn) {
    return this.exec({ method: '_find', params, cacheParamsFn })
  }

  load(id, params, cacheParamsFn) {
    return this.exec({ method: 'load', id, params, cacheParamsFn })
  }

  _load(id, params, cacheParamsFn) {
    return this.exec({ method: '_load', id, params, cacheParamsFn })
  }

  key(key) {
    return {
      load: (id, params, cacheParamsFn) => {
        return this.exec({
          method: 'load',
          id,
          key,
          params,
          cacheParamsFn
        })
      },
      _load: (id, params, cacheParamsFn) => {
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

  multi(key) {
    return {
      load: (id, params, cacheParamsFn) => {
        return this.exec({
          method: 'load',
          id,
          key,
          params,
          cacheParamsFn,
          multi: true
        })
      },
      _load: (id, params, cacheParamsFn) => {
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

  stringifyKey(options, cacheParamsFn = this.options.cacheParamsFn) {
    return stableStringify({
      ...options,
      params: cacheParamsFn(options.params)
    })
  }

  clear() {
    this.cacheMap.clear()
    this.loaders.clear()
    return this
  }
}
