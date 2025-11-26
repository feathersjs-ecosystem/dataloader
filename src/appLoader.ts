import { ServiceLoader, ServiceLoaderOptions, CacheMap } from './serviceLoader.js'
import type { Application } from '@feathersjs/feathers'
import type { CacheParamsFn } from './utils.js'

type ServiceLoaderConstructor = new (options: ServiceLoaderOptions) => ServiceLoader

/** Per-service configuration options */
export interface ServiceConfig {
  /** Custom ServiceLoader class to use for this service */
  ServiceLoader?: ServiceLoaderConstructor
  /** Custom function to extract cache-relevant params */
  cacheParamsFn?: CacheParamsFn
  /** Custom cache storage implementation */
  cacheMap?: CacheMap
  [key: string]: unknown
}

/** Options for configuring an AppLoader instance */
export interface AppLoaderOptions {
  /** The Feathers application instance */
  app: Application
  /** Per-service configuration overrides */
  services?: Record<string, ServiceConfig>
  /** Default ServiceLoader class to use */
  ServiceLoader?: ServiceLoaderConstructor
  /** Default function to extract cache-relevant params */
  cacheParamsFn?: CacheParamsFn
  /** Default cache storage implementation */
  cacheMap?: CacheMap
  [key: string]: unknown
}

/**
 * Application-level loader that manages ServiceLoader instances.
 * Creates and caches loaders for each service on demand.
 */
export class AppLoader {
  options: {
    app: Application
    services: Record<string, ServiceConfig>
    loaderOptions: Omit<AppLoaderOptions, 'app' | 'services'>
  }
  loaders: Map<string, ServiceLoader>

  constructor({ app, services = {}, ...loaderOptions }: AppLoaderOptions) {
    this.options = { app, services, loaderOptions }
    this.loaders = new Map()
  }

  /**
   * Get or create a ServiceLoader for the specified service.
   * @param serviceName - Name of the Feathers service
   * @returns ServiceLoader instance for the service
   */
  service(serviceName: string): ServiceLoader {
    const { app } = this.options
    const { ServiceLoader: CustomServiceLoader, ...loaderOptions } = {
      ServiceLoader: ServiceLoader,
      ...this.options.loaderOptions,
      ...(this.options.services[serviceName] || {})
    }
    const cachedLoader = this.loaders.get(serviceName)

    if (cachedLoader) {
      return cachedLoader
    }

    const loader = new CustomServiceLoader({
      ...loaderOptions,
      serviceName,
      app
    })

    this.loaders.set(serviceName, loader)

    return loader
  }

  /**
   * Clear all cached loaders and their caches.
   */
  async clear(): Promise<this> {
    const promises: Promise<void>[] = []
    this.loaders.forEach((loader) => {
      promises.push(loader.cacheMap.clear() as Promise<void>)
    })
    await Promise.all(promises)
    this.loaders.clear()
    return this
  }
}
