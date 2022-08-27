const BaseServiceLoader = require('./serviceLoader')
module.exports = class AppLoader {
  constructor({ app, services = {}, ServiceLoader = BaseServiceLoader, ...loaderOptions }) {
    this.options = { app, services, loaderOptions, ServiceLoader }
    this.loaders = new Map()
  }

  service(serviceName) {
    const { app, services, loaderOptions, ServiceLoader } = this.options
    const options = { ...loaderOptions, ...(services[serviceName] || {}) }
    const cachedLoader = this.loaders.get(serviceName)

    if (cachedLoader) {
      return cachedLoader
    }

    const loader = new ServiceLoader({
      ...options,
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
