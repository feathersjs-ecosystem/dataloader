import { ServiceLoader } from './serviceLoader.js'
import type { ServiceLoaderOptions } from './serviceLoader.js'

export type ServiceConfig = Omit<ServiceLoaderOptions, 'app' | 'serviceName'>

export interface AppLoaderOptions extends ServiceConfig {
  app: ServiceLoaderOptions['app']
  services?: Record<string, ServiceConfig>
}

/** Creates service loaders lazily and shares each one throughout a request. */
export class AppLoader {
  options: {
    app: ServiceLoaderOptions['app']
    services: Record<string, ServiceConfig>
    key?: string
    maxBatchSize?: number
    loaders: Map<string, ServiceLoader>
  }

  constructor({ app, services = {}, key, maxBatchSize }: AppLoaderOptions) {
    this.options = { app, services, key, maxBatchSize, loaders: new Map() }
  }

  service(serviceName: string): ServiceLoader {
    const { app, services, key, maxBatchSize, loaders } = this.options
    const cachedLoader = loaders.get(serviceName)
    if (cachedLoader) {
      return cachedLoader
    }
    const loader = new ServiceLoader({
      app,
      serviceName,
      key: services[serviceName]?.key ?? key,
      maxBatchSize: services[serviceName]?.maxBatchSize ?? maxBatchSize
    })
    loaders.set(serviceName, loader)
    return loader
  }

  clear(): this {
    const { loaders } = this.options
    loaders.forEach((loader) => loader.clear())
    return this
  }
}
