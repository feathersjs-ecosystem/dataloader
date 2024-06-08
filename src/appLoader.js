const BaseServiceLoader = require('./serviceLoader')

module.exports = class AppLoader {
  constructor({ app, services = {}, ...loaderOptions }) {
    this.options = {
      app,
      services,
      loaderOptions,
      loaders: new Map()
    }
  }

  service(path) {
    const { app } = this.options
    const { ServiceLoader, ...loaderOptions } = {
      ServiceLoader: BaseServiceLoader,
      ...this.options.loaderOptions,
      ...(this.options.services[path] || {})
    }
    const cachedLoader = this.options.loaders.get(path)

    if (cachedLoader) {
      return cachedLoader
    }

    const loader = new ServiceLoader({
      ...loaderOptions,
      path,
      app
    })

    this.options.loaders.set(path, loader)

    return loader
  }

  async clear() {
    const { loaders } = this.options
    const promises = []
    loaders.forEach((loader) => {
      promises.push(loader.clear())
    })
    await Promise.all(promises)
    loaders.clear()
    return this
  }
}
