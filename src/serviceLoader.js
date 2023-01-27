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
    delete loaderParams.query.$limit
    return service[serviceMethod](loaderParams).then((result) => getResults(keys, result, key))
  }, loaderOptions)
}

const stringifyKey =(options, cacheParamsFn) =>{
  return stableStringify({
    ...options,
    params: cacheParamsFn(options.params)
  })
}

module.exports = class ServiceLoader {
  constructor({ app, serviceName, cacheParamsFn, selectFn, cacheMap, ...loaderOptions }) {
    this.cacheMap = cacheMap || new Map()
    this.loaders = new Map()
    const service = app.service(serviceName)
    this.options = {
      app,
      serviceName,
      service,
      key: service.options.id,
      selectFn: selectFn || defaultSelectFn,
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: assign({ cacheKeyFn: defaultCacheKeyFn }, loaderOptions)
    }
  }

  async exec({ cacheParamsFn, ...options }) {
    const { service, loaderOptions } = this.options

    options = assign(
      {
        id: null,
        key: this.options.key,
        params: {},
        multi: false,
        method: 'load'
      },
      options
    )

    if (['get', '_get', 'find', '_find'].includes(options.method)) {
      const cacheKey = stringifyKey(options, cacheParamsFn)

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

    const loaderKey = stringifyKey(
      {
        key: options.key,
        multi: options.multi,
        method: options.method,
        params: options.params
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
    const { serviceName } = this.options
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
      if (parsedKey.serviceName === serviceName) {
        promises.push(this.cacheMap.delete(cacheKey))
      }
    }
    await Promise.all(promises)
    return this
  }
}

class ChainedLoader {
  constructor(loader, options) {
    this.loader = loader
    this.options = options
  }

  key(key) {
    this.options = assign(this.options, { key, multi: false })
    return this
  }

  multi(key) {
    this.options = assign(this.options, { key, multi: true })
    return this
  }

  select(selection) {
    this.options = assign(this.options, { selection })
    return this
  }

  params(cacheParamsFn) {
    this.options = assign(this.options, { cacheParamsFn })
    return this
  }

  async handleResult(result) {
    const { selection } = this.options
    const { selectFn } = this.loader.options

    if (!result || !selection) {
      return result
    }

    return await selectFn(selection, result, this)
  }

  async get(id, params) {
    this.options = assign(this.options, { method: 'get' })
    const result = await this.loader.exec({ ...this.options, id, params })
    return this.handleResult(result)
  }

  async _get(id, params) {
    this.options = assign(this.options, { method: '_get' })
    const result = await this.loader.exec({ ...this.options, id, params })
    return this.handleResult(result)
  }

  async find(params) {
    this.options = assign(this.options, { method: 'find' })
    const result = await this.loader.exec({ ...this.options, params })
    return this.handleResult(result)
  }

  async _find(params) {
    this.options = assign(this.options, { method: '_find' })
    const result = await this.loader.exec({ ...this.options, id, params })
    return this.handleResult(result)
  }

  async load(id, params) {
    this.options = assign(this.options, { method: 'load' })
    const result = await this.loader.exec({ ...this.options, id, params })
    return this.handleResult(result)
  }

  async _load(id, params) {
    this.options = assign(this.options, { method: '_load' })
    const result = await this.loader.exec({ ...this.options, id, params })
    return this.handleResult(result)
  }
}
