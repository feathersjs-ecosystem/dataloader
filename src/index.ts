import DataLoader from 'dataloader'
import { AppLoader } from './appLoader.js'
import { ServiceLoader } from './serviceLoader.js'
import { uniqueKeys, uniqueResults, uniqueResultsMulti } from './utils.js'

export { AppLoader } from './appLoader.js'
export { ServiceLoader } from './serviceLoader.js'
export { DataLoader }
export { uniqueKeys, uniqueResults, uniqueResultsMulti }
export * from './utils.js'

export type { AppLoaderOptions, ServiceConfig } from './appLoader.js'
export type { ServiceLoaderOptions, CacheMap, LoadMethod } from './serviceLoader.js'
export type { Params, CacheParams, CacheParamsFn, ResultWithId, ServiceResult } from './utils.js'

export default {
  AppLoader,
  DataLoader,
  ServiceLoader,
  uniqueKeys,
  uniqueResults,
  uniqueResultsMulti
}
