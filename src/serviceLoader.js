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
  assign
} = require('./utils')

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
    delete loaderParams.query.$limit
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
      loaderOptions: assign({ cacheKeyFn: defaultCacheKeyFn }, loaderOptions)
    }
  }

  async exec({ cacheParamsFn, ...options }) {
    const { appService, loaderOptions, service } = this.options
    cacheParamsFn = cacheParamsFn || this.options.cacheParamsFn

    options = assign(
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

      const cachedResult = await this.cacheMap.get(cacheKey)

      if (cachedResult) {
        return cachedResult
      }

      const result = ['get', '_get'].includes(options.method)
        ? await appService[options.method](options.id, options.params)
        : await appService[options.method](options.params)

      await this.cacheMap.set(cacheKey, result)

      return result
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

    const cachedResult = await this.cacheMap.get(cacheKey)

    if (cachedResult) {
      return cachedResult
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

    const result = Array.isArray(sortedId)
      ? await dataLoader.loadMany(sortedId)
      : await dataLoader.load(sortedId)

    await this.cacheMap.set(cacheKey, result)

    return result
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

  select(selection) {
    return new ChainedLoader(this, { key: this.options.key, selection })
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
  constructor(loader, options) {
    this.options = { ...options, loader }
  }

  key(key) {
    return this.set({ key, multi: false })
  }

  multi(key) {
    return this.set({ key, multi: true })
  }

  select(selection) {
    return this.set({ selection })
  }

  params(cacheParamsFn) {
    return this.set({ cacheParamsFn })
  }

  async get(id, params) {
    return this.set({ method: 'get', id, params }).exec()
  }

  async _get(id, params) {
    return this.set({ method: '_get', id, params }).exec()
  }

  async find(params) {
    return this.set({ method: 'find', params }).exec()
  }

  async _find(params) {
    return this.set({ method: '_find', params }).exec()
  }

  async load(id, params) {
    return this.set({ method: 'load', id, params }).exec()
  }

  async _load(id, params) {
    return this.set({ method: '_load', id, params }).exec()
  }

  set(options) {
    this.options = assign(this.options, options)
    return this
  }

  async handleResult(result) {
    const { selection } = this.options
    const { selectFn } = this.options.loader.options

    if (!result || !selection) {
      return result
    }

    return await selectFn(selection, result, this.options)
  }

  async exec() {
    const options = { ...this.options }
    delete options.selection
    delete options.loader
    const result = await this.options.loader.exec(options)
    return this.handleResult(result)
  }
}
