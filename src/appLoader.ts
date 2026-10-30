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
    loaderOptions: ServiceConfig
    loaders: Map<string, ServiceLoader>
  }

  constructor({ app, services = {}, ...loaderOptions }: AppLoaderOptions) {
    this.options = { app, services, loaderOptions, loaders: new Map() }
  }

  service(serviceName: string): ServiceLoader {
    const { app, services, loaderOptions, loaders } = this.options
    const cachedLoader = loaders.get(serviceName)
    if (cachedLoader) {
      return cachedLoader
    }
    const loader = new ServiceLoader({ ...loaderOptions, ...services[serviceName], serviceName, app })
    loaders.set(serviceName, loader)
    return loader
  }

  clear(): this {
    const { loaders } = this.options
    loaders.forEach((loader) => loader.clear())
    return this
  }
}
