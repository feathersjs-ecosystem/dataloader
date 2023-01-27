const BaseServiceLoader = require('./serviceLoader')

module.exports = class AppLoader {
  constructor({ app, services = {}, ...loaderOptions }) {
    this.options = { app, services, loaderOptions }
    this.loaders = new Map()
  }

  service(path) {
    const { app } = this.options
    const { ServiceLoader, ...loaderOptions } = {
      ServiceLoader: BaseServiceLoader,
      ...this.options.loaderOptions,
      ...(this.options.services[path] || {})
    }
    const cachedLoader = this.loaders.get(path)

    if (cachedLoader) {
      return cachedLoader
    }

    const loader = new ServiceLoader({
      ...loaderOptions,
      service: path,
      app
    })

    this.loaders.set(path, loader)

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
