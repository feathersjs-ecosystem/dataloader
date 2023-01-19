const BaseServiceLoader = require('./serviceLoader')

module.exports = class AppLoader {
  constructor({ app, services = {}, ...loaderOptions }) {
    this.options = { app, services, loaderOptions }
    this.loaders = new Map()
  }

  service(serviceName) {
    const { app } = this.options
    const { ServiceLoader, ...loaderOptions } = {
      ServiceLoader: BaseServiceLoader,
      ...this.options.loaderOptions,
      ...(this.options.services[serviceName] || {})
    }
    const cachedLoader = this.loaders.get(serviceName)

    if (cachedLoader) {
      return cachedLoader
    }

    const loader = new ServiceLoader({
      ...loaderOptions,
      serviceName,
      app
    })

    this.loaders.set(serviceName, loader)

    return loader
  }

  async clear() {
    const promises = []
    this.loaders.forEach((loader) => {
      promises.push(loader.cacheMap.clear())
    })
    await Promise.all(promises)
    this.loaders.clear()
    return this
  }
}
