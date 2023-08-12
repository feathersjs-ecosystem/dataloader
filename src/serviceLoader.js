const { GeneralError } = require('@feathersjs/errors')
const DataLoader = require('dataloader')
const {
  stableStringify,
  defaultCacheParamsFn,
  defaultCacheKeyFn,
  defaultSelectFn,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti,
  _
} = require('./utils')

const filters = ['$limit', '$skip', '$select', '$sort']

const createDataLoader = ({ appService, key, loaderOptions, multi, method, params }) => {
  const serviceMethod = method === '_load' ? '_find' : 'find'

  if (!appService[serviceMethod]) {
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
    return appService[serviceMethod](loaderParams).then((result) => getResults(keys, result, key))
  }, loaderOptions)
}

const stringifyKey = (options, cacheParamsFn) => {
  return stableStringify({
    ...options,
    params: cacheParamsFn(options.params)
  })
}

module.exports = class ServiceLoader {
  constructor({ app, service, cacheParamsFn, selectFn, cacheMap, ...loaderOptions }) {
    this.cacheMap = cacheMap || new Map()
    this.loaders = new Map()
    const appService = app.service(service)
    this.options = {
      app,
      service,
      appService,
      key: appService.options.id,
      selectFn: selectFn || defaultSelectFn,
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: _.assign({ cacheKeyFn: defaultCacheKeyFn }, loaderOptions)
    }
  }

  async exec({ cacheParamsFn, ...options }) {
    const { appService, loaderOptions, service } = this.options
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
        service
      }
    )

    if (['get', '_get', 'find', '_find'].includes(options.method)) {
      const cacheKey = stringifyKey(options, cacheParamsFn)

      const cachedPromise = await this.cacheMap.get(cacheKey)

      if (cachedPromise) {
        return cachedPromise
      }

      const promise = ['get', '_get'].includes(options.method)
        ? appService[options.method](options.id, options.params)
        : appService[options.method](options.params)

      await this.cacheMap.set(cacheKey, promise)

      return promise
    }

    if (options.params.query && _.has(options.params.query, filters)) {
      throw new GeneralError('Loader `load()` method cannot contain ${filters} in the query')
    }

    // stableStringify does not sort arrays on purpose because
    // array order matters in most cases. In this case, the
    // order of ids does not matter to the load function but
    // does to the cache key, thats why these are sorted.
    const sortedId = Array.isArray(options.id) ? [...options.id].sort() : options.id

    const cacheKey = stringifyKey(
      {
        ...options,
        id: sortedId
      },
      cacheParamsFn
    )

    const cachedPromise = await this.cacheMap.get(cacheKey)

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

    const dataLoader =
      this.loaders.get(loaderKey) ||
      createDataLoader({
        appService,
        loaderOptions,
        ...loaderConfig
      })

    this.loaders.set(loaderKey, dataLoader)

    const promise = Array.isArray(sortedId) ? dataLoader.loadMany(sortedId) : dataLoader.load(sortedId)

    await this.cacheMap.set(cacheKey, promise)

    return promise
  }

  get(id, params) {
    return this.exec({ method: 'get', id, params })
  }

  _get(id, params) {
    return this.exec({ method: '_get', id, params })
  }

  find(params) {
    return this.exec({ method: 'find', params })
  }

  _find(params) {
    return this.exec({ method: '_find', params })
  }

  load(id, params) {
    return this.exec({ method: 'load', id, params })
  }

  _load(id, params) {
    return this.exec({ method: '_load', id, params })
  }

  key(key) {
    return new ChainedLoader(this, { key })
  }

  multi(key) {
    return new ChainedLoader(this, { key, multi: true })
  }

  select(selection, selectFn) {
    return new ChainedLoader(this, {
      key: this.options.key,
      selection,
      selectFn
    })
  }

  params(cacheParamsFn) {
    return new ChainedLoader(this, { key: this.options.key, cacheParamsFn })
  }

  async clear() {
    const { service } = this.options
    this.loaders.clear()
    const promises = []
    // TODO: This could be a redis store or some other
    // async storage. That's why there is this for/await
    // iterator used to step over all the keys in a collection.
    // Is it a good idea to just be pushing all the deletes into
    // one Promise.all() after? Instead, we may want to call
    // the delete in the iteration. But that would be slower.
    for await (const cacheKey of this.cacheMap.keys()) {
      const parsedKey = JSON.parse(cacheKey)
      if (parsedKey.service === service) {
        promises.push(this.cacheMap.delete(cacheKey))
      }
    }
    await Promise.all(promises)
    return this
  }
}

class ChainedLoader {
  constructor(loader, { selectFn, selection, ...config }) {
    this.loader = loader
    this.options = {
      selection,
      selectFn: selectFn || this.loader.options.selectFn
    }
    this.config = config
  }

  key(key) {
    return this._set({ key })
  }

  multi(key) {
    return this._set({ multi: true, key })
  }

  select(selection, selectFn) {
    this.options.selection = selection
    if (selectFn) {
      this.options.selectFn = selectFn
    }
    return this
  }

  params(cacheParamsFn) {
    return this._set({ cacheParamsFn })
  }

  async get(id, params) {
    return this._set({ method: 'get', id, params }).exec()
  }

  async _get(id, params) {
    return this._set({ method: '_get', id, params }).exec()
  }

  async find(params) {
    return this._set({ method: 'find', params }).exec()
  }

  async _find(params) {
    return this._set({ method: '_find', params }).exec()
  }

  async load(id, params) {
    return this._set({ method: 'load', id, params }).exec()
  }

  async _load(id, params) {
    return this._set({ method: '_load', id, params }).exec()
  }

  _set(config) {
    this.config = _.assign(this.config, config)
    return this
  }

  async handleResult(result) {
    const { selection, selectFn } = this.options

    if (!result || !selection) {
      return result
    }

    return selectFn(selection, result, this.config)
  }

  async exec() {
    const result = await this.loader.exec(this.config)
    return this.handleResult(result)
  }
}
