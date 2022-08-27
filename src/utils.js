const { GeneralError } = require('@feathersjs/errors')

const isObject = (obj) => {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
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
        const key = keys[index];
        result[key] = value[key]
      }
      return result
    }

    return value
  })
}

// Conveniece method for users that strips off any functions
// that can't be serialized in the key. Returning undefined
// is fine because the JSON.stringify will remove it
const removeFunctions = (params) => {
  if (Array.isArray(params)) {
    return params.map(removeFunctions)
  }
  if (isObject(params)) {
    const keys = Object.keys(params)
    const result = {}
    for (let index = 0, length = keys.length; index < length; ++index) {
      const key = keys[index];
      result[key] = removeFunctions(params[key])
    }
    return result
  }
  if (typeof params === 'function') {
    return undefined
  }
  return params
}

module.exports.defaultCacheParamsFn = (params) => {
  if (!params) {
    return params
  }
  return removeFunctions(params)
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
    const key = keys[index];
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
