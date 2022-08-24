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

const createDataLoader = ({ service, idKey, loaderOptions, multi, params = {} }) => {
  if (!service.find) {
    throw new GeneralError('Cannot create a loader for a service that does not have a find method.')
  }

  const getResults = multi ? uniqueResultsMulti : uniqueResults

  return new DataLoader(async (keys) => {
    return service
      .find({
        ...params,
        paginate: false,
        query: {
          ...params.query,
          // TODO: Should this be placed in an $and query?
          [idKey]: { $in: uniqueKeys(keys) }
        }
      })
      .then((result) => {
        return getResults(keys, result, idKey)
      })
  }, loaderOptions)
}

module.exports = class ServiceLoader {
  constructor({ service, ...options }) {
    const { cacheParamsFn, cacheMap, ...rest } = options;
    this._cacheMap = cacheMap || new Map()
    this._options = {
      service,
      idKey: service.options.id,
      cacheParamsFn: cacheParamsFn || defaultCacheParamsFn,
      loaderOptions: {
        cacheKeyFn: defaultCacheKeyFn,
        ...rest
      }
    }
  }

  async get(id, params, cacheParamsFn = this.options._cacheParamsFn) {
    const { service, idKey } = this._options
    const key = stableStringify({
      id,
      idKey,
      method: 'get',
      params: cacheParamsFn(params)
    })

    const cachedResult = await this._cacheMap.get(key)

    if (cachedResult) {
      return cachedResult
    }

    const result = await service.get(context.id, params)

    await this._cacheMap.set(key, result)

    return result;
  }

  find(params, cacheParamsFn = this.options._cacheParamsFn) {
    const { service, idKey } = this._options
    const key = stableStringify({
      id: null,
      idKey,
      method: 'find',
      params: cacheParamsFn(params)
    })

    const cachedResult = await this._cacheMap.get(key)

    if (cachedResult) {
      return cachedResult
    }

    const result = await service.find(params)

    await this._cacheMap.set(key, result)

    return result
  }

  exec({ ...options }) {
    const { service, loaderOptions } = this._options
    const { id, idKey, params, multi, cacheParamsFn } = {
      idKey: this._options.idKey,
      params: null,
      multi: false,
      cacheParamsFn: this.options._cacheParamsFn,
      ...options
    }

    // stableStringify does not sort arrays on purpose because
    // array order matters in most cases. In this case, the
    // order of ids does not matter to the load function but
    // does to the cache key, thats what these are sorted./
    const sortedId = Array.isArray(id) ? [...id].sort() : id;
    const resultKey = stableStringify({
      id: sortedId,
      idKey,
      method: multi ? 'load-multi' : 'load',
      params: cacheParamsFn(params)
    })
    const loaderKey = stableStringify({
      idKey,
      method: multi ? 'load-multi' : 'load',
      params: cacheParamsFn(params)
    })

    const cachedResult = this._cacheMap.get(resultKey)

    if (cachedResult) {
      return cachedResult
    }


    const newLoader = createDataLoader({
      idKey,
      params,
      service,
      loaderOptions,
      multi
    })

    this._cacheMap.set(resultKey, newLoader)

    if (Array.isArray(sortedId)) {
      return newLoader.loadMany(sortedId)
    }

    const result = await newLoader.load(sortedId)

    return result
  }

  load(id, params, cacheParamsFn = this.options._cacheParamsFn) {
    return this.exec({
      id,
      params,
      cacheParamsFn,
      multi: false
    })
  }

  key(idKey) {
    return {
      load: (id, params, cacheParamsFn = this.options._cacheParamsFn) => {
        return this.exec({
          id,
          idKey,
          params,
          cacheParamsFn,
          multi: false
        })
      }
    }
  }

  multi(idKey) {
    return {
      load: (id, params, cacheParamsFn = this.options._cacheParamsFn) => {
        return this.exec({
          id,
          idKey,
          params,
          cacheParamsFn,
          multi: true
        })
      }
    }
  }

  clearAll() {
    this._cacheMap.clear()
    return this
  }
}
