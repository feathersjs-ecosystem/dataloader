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
      name: serviceName,
      service: app.service(serviceName)
    })

    this.loaders.set(serviceName, loader)

    return loader
  }

  clear() {
    this.loaders.clear()
    return this
  }
}
