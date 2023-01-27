const { GeneralError } = require('@feathersjs/errors')

const isObject = (obj) => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }
  return Object.getPrototypeOf(obj) === Object.prototype
}

module.exports.stableStringify = (object) => {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === 'function') {
      throw new GeneralError(
        'Cannot stringify non JSON value. The object passed to stableStringify must be serializable.'
      )
    }

    if (isObject(value)) {
      const keys = Object.keys(value).sort()
      const result = {}
      for (let index = 0, length = keys.length; index < length; ++index) {
        const key = keys[index]
        result[key] = value[key]
      }
      return result
    }

    return value
  })
}

module.exports.defaultCacheParamsFn = (params) => {
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

module.exports.defaultCacheKeyFn = (id) => {
  if (!id) {
    return id
  }
  return id.toString ? id.toString() : String(id)
}

const select = (selection, source) => {
  return selection.reduce((result, key) => {
    if (source[key] !== undefined) {
      result[key] = source[key]
    }
    return result
  }, {})
}

module.exports.defaultSelectFn = (selection, result, chainedLoader) => {
  if (!Array.isArray(selection)) {
    throw new Error('selection must be an array')
  }

  const { key, method } = chainedLoader.options

  const convertResult = (result) => {
    return select([key, ...selection], result)
  }

  if (['find', '_find'].includes(method) && result.data) {
    return {
      ...result,
      data: result.data.map(convertResult)
    }
  }

  if (Array.isArray(result)) {
    return result.map((result) => {
      return Array.isArray(result) ? result.map(convertResult) : convertResult(result)
    })
  }

  return convertResult(result)
}

module.exports.assign = (target, source) => {
  const result = { ...target }
  Object.keys(source).forEach((key) => {
    if (source[key] !== undefined) {
      result[key] = source[key]
    }
  })
  return result
}

module.exports.uniqueKeys = (keys) => {
  const found = {}
  const unique = []

  for (let index = 0, length = keys.length; index < length; ++index) {
    const key = keys[index]
    if (!found[key]) {
      found[key] = unique.push(key)
    }
  }

  return unique
}

module.exports.uniqueResults = (keys, result, key = 'id', defaultValue = null) => {
  const serviceResults = result.data || result
  const found = {}
  const results = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const result = serviceResults[index]
    const id = result[key]
    found[id] = result
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found[keys[index]] || defaultValue)
  }

  return results
}

module.exports.uniqueResultsMulti = (keys, result, key = 'id', defaultValue = null) => {
  const serviceResults = result.data || result
  const found = {}
  const results = []

  for (let index = 0, length = serviceResults.length; index < length; ++index) {
    const result = serviceResults[index]
    const id = result[key]
    if (found[id]) {
      found[id].push(result)
    } else {
      found[id] = [result]
    }
  }

  for (let index = 0, length = keys.length; index < length; ++index) {
    results.push(found[keys[index]] || defaultValue)
  }

  return results
}
