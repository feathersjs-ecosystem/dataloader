const { GeneralError } = require('@feathersjs/errors')

const _ = {
  isObject: (obj) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return false
    }
    return Object.getPrototypeOf(obj) === Object.prototype
  },
  assign: (target, source) => {
    const result = { ...target }
    const keys = Object.keys(source)
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      if (source[key] !== undefined) {
        result[key] = source[key]
      }
    }
    return result
  },
  omit: (source, keys) => {
    const result = { ...source }
    for (let index = 0; index < keys.length; index++) {
      delete result[keys[index]]
    }
    return result
  },
  pick: (source, keys) => {
    return keys.reduce((result, key) => {
      if (source[key] !== undefined) {
        result[key] = source[key]
      }
      return result
    }, {})
  },
  has: (source, keys) => {
    for (let index = 0; index < keys.length; index++) {
      if (Object.prototype.hasOwnProperty.call(source, keys[index])) {
        return true
      }
    }
    return false
  }
}

module.exports._ = _

module.exports.stableStringify = (object) => {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === 'function') {
      throw new GeneralError(
        'Cannot stringify non JSON value. The object passed to stableStringify must be serializable.'
      )
    }

    if (_.isObject(value)) {
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
