<!--- Usage --------------------------------------------------------------------------------------->
<h2 id="Usage">Usage</h2>

The easiest way to use feathers-datalaoader is to use the `AppLoader`. This is a high level class that configures and caches the lower level classes on the fly with common defaults and best practices.

```js
npm install --save feathers-dataloader

const { AppLoader } = require('feathers-dataloader');

const loader = new AppLoader({ app });

// Load one user with id 1
const user = await loader.service('users').load(1, params);

// Load one user with username "FeathersUser"
const user = await loader.service('users').key('username').load('FeathersUser', params);

// Load one user per userId in the array
const users = loader.service('users').load([1, 2, 3], params);

// Load multiple comments for user with userId 1
const comments = await loader.service('comments').multi('userId').load(1, params);

// Load multiple comments for each userId in the array
const comments = await loader.service('comments').multi('userId').load([1, 2, 3], params);


// You can also call get() and find() methods.
// These are helpful for gets/finds that are not necessarily a
// "relationships" but can still benefit from caching the results.
const user = await loader.service('users').get(1);
const users = await loader.service('users').find({ query: { status: 'active' } });

// Similarly you can call underscored methods if the service allows it
const user = await loader.service('users')._get(1);
const user = await loader.service('users')._load(1);
const users = await loader.service('users')._find({ query: { status: 'active' } });
```

Loaders are most commonly used when resolving data onto results. This is generally done in hooks like `@feathers-/schema`, `withResult`, or `fastJoin`. Setup a loader in before hooks to make it available to these other hooks.

```js
const { AppLoader } = require('feathers-dataloader');


// Use app.hooks() to initiliaze or pass on a loader
// with each service request. This ensures there is
// always params.loader available in subsequent hooks.
const initializeLoader = context => {
  if (context.params.loader) {
    return context;
  }
  context.params.loader = new AppLoader({ app: context.app });
  return context;
}

app.hooks({
  before: {
    all: [initializeLoader]
  }
});
```

Now loaders are available everywhere! No need to instantiate or configure a `ServiceLoader` for each service ahead of time. `ServiceLoader` are lazily created and cached as they are called. It is also best practice to pass the loader onto susequent service/loader calls to maximize effeciency. See the [Guide](./docs/guide.md) section for more info.

```js
const { resolveResult, resolve } = require('@feathersjs/schema');

const postResultsResolver = resolve({
  properties: {
    user: (value, post, context) => {
      const { loader } = context.params;
      return loader.service('users').load(post.userId, { loader });
    }
  }
});

app.service('posts').hooks({
  after: {
    all: [resolveResult(postResultsResolver)]
  }
});
```

The `AppLoader` lazily configures a new `ServiceLoader` per service as you use them. This means that you do not have to configure the lower level `ServiceLoader` classes. But, you can use these classes individually, although it is generally not needed.

```js

const { ServiceLoader } = require('feathers-dataloader');

const serviceLoader = new ServiceLoader({ app, service: 'users' });
const user = await serviceLoader.load(1, params);
const user = await serviceLoader.get(1, params);
const users = await serviceLoader.find(params);

const user = await serviceLoader._load(1, params);
const user = await serviceLoader._get(1, params);
const users = await serviceLoader._find(params);

await serviceLoader.clear();
```

The `ServiceLoader` configures a `DataLoader` with some basic options. The `DataLoader` is a powerful batching and caching class that dramatically imporoves performance. It is based on the [facebook/dataloader](https://github.com/facebook/dataloader). If you are interested in how this works in depth, check out this [GREAT VIDEO](https://www.youtube.com/watch?v=OQTnXNCDywA) by its original author.


```js
const { DataLoader, uniqueKeys, uniqueResults } = require('feathers-dataloader');

const usersLoader = new DataLoader(async (keys) => {
    const results = await users.find({ query: { id: { $in: uniqueKeys(keys) } } });
    return uniqueResults(keys, results);
  }
);

const user = await usersLoader.load(1);
```

<!--- class AppLoader --------------------------------------------------------------------------->
<h2 id="class-apploader">class AppLoader( [, options] )</h2>

Create a new app-loader. This is the most commonly used class.

- **Arguments:**
  - `{Object} [ options ]`
    - `{Object} app`
    - `{Object} services`
    - `{Class} ServiceLoader`
    - ...globalLoaderOptions

| Argument        |    Type    |   Default  | Description                                      |
| --------------- | :--------: | ---------- | ------------------------------------------------ |
| `app`           | `Object`   |            | A Feathers app                                   |
| `services`      |  `Object`  | `{}`| An object where each property is a service name and the value is loader options for that service. These options override the `globalLoaderOptions` |
| `ServiceLoader`      |  `Class`  | `ServiceLoader`| A base class that will be used to create each ServiceLoader instance |
| `globalLoaderOptions`           | `Object`   |      {}      | Options that will be assigned to every new `ServiceLoader`                                |

```js
  const { AppLoader } = require("feathers-dataloader");

  const appLoader = new AppLoader({
    app,
    { maxBatchSize: 500 }
    services: {
      users: { maxBatchSize: 100 }
    }
  });

  const loader = appLoader.service('users');

  const user = await loader.load(1, params);
  const user = await loader.key('username').load('FeathersUser', params);
  const users = await loader.load([1, 2, 3], params);

  const authorUsers = await loader.multi('role').load('author', params);
  const usersByRole = await loader.multi('role').load(['author', 'reader'], params);

  const user = await loader.get(1, params);
  const users = await loader.find(params);

  await loader.clear()
```

<!--- class ServiceLoader --------------------------------------------------------------------------->
<h2 id="class-serviceloader">class ServiceLoader( [, options] )</h2>

Create a new service-loader. This class lazily configures underlying `DataLoader` and `FindLoader` for a given service

- **Arguments:**
  - `{Object} [ options ]`
    - `{Object} service`
    - `{Map} cacheMap`
    - `{Map} cacheParamsFn`
    - ...loaderOptions

| Argument        |    Type    |   Default  | Description                                      |
| --------------- | :--------: | ---------- | ------------------------------------------------ |
| `app`           | `Object`   |            | A Feathers app`                                   |
| `service`           | `String`   |            | The name of the service like "users"`                                   |
| `cacheMap`           | `Map`   |            | A Map like object with methods get, set, and clear to serve as the cache of results.`                                   |
| `cacheParamsFn`           | `Function`   |      defaultCacheParamsFn      | A function that returns a JSON stringifiable set or params to be used in the cacheKey. The default function traverses the params and removes any functions`                                   |
| `loaderOptions`           | `Object`   |      {}      | See `DataLoader`                           |


```js
  const { ServiceLoader } = require("feathers-dataloader");

  const loader = new ServiceLoader({
    app,
    service: 'users'
    cacheParamsFn: (params) => {
      return {
        userId: params.user.id,
        query: params.query
      }
    },
    maxBatchSize: 500 // see DataLoader
  });

  const user = await loader.load(1, params);
  const user = await loader.key('username').load('FeathersUser', params);
  const users = await loader.load([1, 2, 3], params);

  const authorUsers = await loader.multi('role').load('author', params);
  const usersByRole = await loader.multi('role').load(['author', 'reader'], params);

  const user = await loader.get(1, params);
  const users = await loader.find(params);

  const user = await loader._get(1, params);
  const users = await loader._find(params);
  const user = await loader._load(1,params);

  await loader.clear()
```

<!--- class DataLoader --------------------------------------------------------------------------->
<h2 id="class-dataloader">class DataLoader( batchLoadFunc [, options] )</h2>

This library re-exports [Dataloader](https://www.npmjs.com/package/dataloader) from its original package. Please see its documentation for more information. `loaderOptions` given to `BatchLoader` will be used to configure Dataloaders. You can also import `Dataloader` along with some helpful utility functions to build custom loaders.

  ```js
  const { DataLoader uniqueResults, uniqueKeys } = require("feathers-dataloader");

  const batchFn = async (keys, context) => {
    const data = await users.find({
      query: { id: { $in: uniqueKeys(keys) } },
      paginate: false,
    });
    return uniqueResults(keys, data);
  }

  const usersLoader = new DataLoader(
    batchFn,
    {
      batch: true,
      cache: true,
      maxBatchSize: 100,
      cacheKeyFn: (key) => key,
      cacheMap: new Map()
    }
  );
  ```

<!--- uniqueKeys ------------------------------------------------------------------------------->
<h2 id="uniqueKeys">uniqueKeys(keys)</h2>

Returns the unique elements in an array.

- **Arguments:**
  - `{Array<String | Number>} keys`

| Argument | Type                           | Default | Description                       |
| -------- | ------------------------------ | ------- | --------------------------------- |
| `keys`   | `Array<` `String /` `Number >` |         | The keys. May contain duplicates. |

- **Example:**

  ```js
  const usersLoader = new DataLoader(async keys =>
    const data = users.find({ query: { id: { $in: uniqueKeys(keys) } } })
    ...
  );
  ```

<!--- uniqueResults ----------------------------------------------------------------------------->
<h2 id="uniqueResults">uniqueResults(keys, result, idProp = 'id', defaultValue = null)</h2>

Reorganizes the records from the service call into the result expected from the batch function. Returns one result per key and is generally used for `get({ id: 1 })`

- **Arguments:**
  - `{Array<String | Number>} keys`
  - `{Object | Array<Object>} result`
  - `{String} idProp`
  - `{Any} defaultValue`

| Argument           |             Type              | Default | Description                                                                                                   |
| ------------------ | :---------------------------: | ------- | ------------------------------------------------------------------------------------------------------------- |
| `keys`             | `Array<` `String /` `Number>` |         | An array of `key` elements, which the value the batch loader function will use to find the records requested. |
| `result`          |     `Array< ` `Object >`      |         | Any service method result.                                                  |
| `idProp` |          `String`           |     'id'    | The "id" property of the records.                                                                                                    |
| `defaultValue`             |           `Any`            |     null    | The default value returned when there is no result matching a key.                                                  |


  ```js
  const usersLoader = new DataLoader(async (keys) => {
    const data = users.find({ query: { id: { $in: uniqueKeys(keys) } } });
   return uniqueResults(keys, result, "id", null);
  });
  ```

  <!--- uniqueResultsMulti ----------------------------------------------------------------------------->
<h2 id="uniqueResultsMulti">uniqueResultsMulti(keys, result, idProp = 'id', defaultValue = null)</h2>

Reorganizes the records from the service call into the result expected from the batch function. Returns multiple results per key and is generally used for `find({ id: 1 })`

- **Arguments:**
  - `{Array<String | Number>} keys`
  - `{Object | Array<Object>} result`
  - `{String} idProp`
  - `{Any} defaultValue`

| Argument           |             Type              | Default | Description                                                                                                   |
| ------------------ | :---------------------------: | ------- | ------------------------------------------------------------------------------------------------------------- |
| `keys`             | `Array<` `String /` `Number>` |         | An array of `key` elements, which the value the batch loader function will use to find the records requested. |
| `result`          |     `Array< ` `Object >`      |         | Any service method result.                                                  |
| `idProp` |          `String`           |     'id'    | The "id" property of the records.                                                                                                    |
| `defaultValue`             |           `Any`            |     null    | The default value returned when there is no result matching a key.                                                  |


  ```js
  const usersLoader = new DataLoader(async (keys) => {
    const keys = uniqueKeys(keys);
    const result = users.find({ query: { id: { $in: uniqueKeys(keys) } } });
    return uniqueResultsMulti(keys, result, "id", null);
  });
  ```
