const { GeneralError } = require('@feathersjs/errors')
const DataLoader = require('dataloader')
const {
  stableStringify,
  defaultCacheParamsFn,
  defaultCacheKeyFn,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  _
} = require('./utils')

const filters = ['$limit', '$skip', '$sort']

const createDataLoader = ({ service, key, loaderOptions, multi, method, params }) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'

  if (!service[serviceMethod]) {
    throw new GeneralError(
      `Cannot create a loader for a service that does not have a ${serviceMethod} method.`
    )
  }

  const getResults = multi ? uniqueResultsMulti : uniqueResults

  return new DataLoader(async (keys) => {
    const loaderParams = {
      ...params,
      paginate: false,
      query: {
        ...params.query,
        // TODO: Should this be placed in an $and query?
        [key]: { $in: uniqueKeys(keys) }
      }
    }
    return service[serviceMethod](loaderParams).then((result) => getResults(keys, result, key))
  }, loaderOptions)
}

const stringifyKey = (options, cacheParamsFn) => {
  return stableStringify({
    ...options,
    params: cacheParamsFn(options.params)
  })
}

module.exports = class ServiceLoader {
  constructor({ app, path, cacheParamsFn, cacheMap, ...loaderOptions }, state) {
    const service = app.service(path)
    this.options = {
      app,
      path,
      service,
      key: service.options.id,
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: _.assign({ cacheKeyFn: defaultCacheKeyFn }, loaderOptions),
      loaders: new Map(),
      cacheMap: cacheMap || new Map()
    }
    this.state = state || {}
  }

  async exec({ cacheParamsFn, ...options }) {
    const { path, service, loaderOptions, cacheMap, loaders } = this.options
    cacheParamsFn = cacheParamsFn || this.options.cacheParamsFn

    options = _.assign(
      {
        id: null,
        key: this.options.key,
        params: {},
        multi: false,
        method: 'load'
      },
      {
        ...options,
        path
      }
    )

    if (['get', '_get', 'find', '_find'].includes(options.method)) {
      const cacheKey = stringifyKey(options, cacheParamsFn)

      const cachedPromise = await cacheMap.get(cacheKey)

      if (cachedPromise) {
        return cachedPromise
      }

      const promise = ['get', '_get'].includes(options.method)
        ? service[options.method](options.id, options.params)
        : service[options.method](options.params)

      await cacheMap.set(cacheKey, promise)

      return promise
    }

    if (options.params.query && _.has(options.params.query, filters)) {
      throw new GeneralError('Loader `load()` method cannot contain ${filters} in the query')
    }

    const cacheKey = stringifyKey(options, cacheParamsFn)

    const cachedPromise = await cacheMap.get(cacheKey)

    if (cachedPromise) {
      return cachedPromise
    }

    const loaderConfig = {
      key: options.key,
      multi: options.multi,
      method: options.method,
      params: options.params
    }

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

    const promise = Array.isArray(options.id) ? dataLoader.loadMany(options.id) : dataLoader.load(options.id)

    await cacheMap.set(cacheKey, promise)

    return promise
  }

  get(id, params) {
    return this.exec({ ...this.state, method: 'get', id, params })
  }

  _get(id, params) {
    return this.exec({ ...this.state, method: '_get', id, params })
  }

  find(params) {
    return this.exec({ ...this.state, method: 'find', params })
  }

  _find(params) {
    return this.exec({ ...this.state, method: '_find', params })
  }

  load(id, params) {
    return this.exec({ ...this.state, method: 'load', id, params })
  }

  _load(id, params) {
    return this.exec({ ...this.state, method: '_load', id, params })
  }

  key(key) {
    return new ServiceLoader(this.options, { key })
  }

  multi(key) {
    return new ServiceLoader(this.options, { key, multi: true })
  }

  async clear() {
    const { path, loaders, cacheMap } = this.options
    loaders.clear()
    const promises = []
    // TODO: This could be a redis store or some other
    // async storage. That's why there is this for/await
    // iterator used to step over all the keys in a collection.
    // Is it a good idea to just be pushing all the deletes into
    // one Promise.all() after? Instead, we may want to call
    // the delete in the iteration. But that would be slower.
    // Also note that we don't just clear the whole cache
    // and only delete the keys that match the path because
    // the user may have shared the cacheMap with other
    // services.
    for await (const cacheKey of cacheMap.keys()) {
      const parsedKey = JSON.parse(cacheKey)
      if (parsedKey.path === path) {
        promises.push(cacheMap.delete(cacheKey))
      }
    }
    await Promise.all(promises)
    return this
  }
}
