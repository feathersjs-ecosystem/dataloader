<!--
This was formerly in the Dove migration guide
 -->

### Populating With Resolvers

Resolvers provide a basic way of pulling in data from other services onto results from the current service. They work especially well for populating data onto the results of `get` requests and even on nested `get` requests (multiple levels deep). For anything more complex than `get` requests, you can now use Data Loaders in your resolvers.

Read more about populating with data loaders, [here](#populating-with-loaders).

## Data Loaders

Feathers Dove introduces memorable new APIs for batch-loading and caching. And for the first time, Feathers has a built-in solution for populating data: Cache Loaders, App Loaders, and Service Loaders!

You can learn more about Data Loaders, [here](/api/loader/index).

### Cache Loaders

Speed is the goal. Cache Loaders make your apps one step faster by preventing the need to re-request data. Cache Loaders have a familiar API for making requests and caching the results of those requests. The Cache Loaders include the `FindLoader`, the `GetLoader`, and the `find` and `get` methods of the new `ServiceLoader` classes.

Learn more about Cache Loaders, [here](/api/loader/cache-loaders).

### Service Loaders

We mentioned that speed is the goal. The `ServiceLoader` class provides huge speed improvements through intelligent batching of requests. Service Loaders can combine many requests to a service into a single request, saving round-trips to the database.

Thanks to the power of the Feathers Service Interface, these new loaders work with **every** database adapter and almost any custom service. They also cache results with their own built-in cache layer.

Learn more about Service Loaders, [here](/api/loader/service-loader).

### App Loaders

App Loaders are the most convenient way to lazily instantiate Service Loaders and use them anywhere in your API. Once you've created an app loader, you can call the `service` method to either create or reference a Service Loader by service path name. You can then call `loader.service('users')`, for example, to create or recall a loader for the `users` service. It's a familiar API, being very similar to Feathers' `app.service` method.

Learn more about App Loaders, [here](/api/loader/app-loader). <br>

### Populating With Loaders

When you combine resolvers with data loaders, you get you get the most concise, beautiful API for populating data. It's not even necessary to write schemas to define relationships, first.

Read the "Populating Data" guide, [here](./populating)

### Community Contributed

Many thanks to [@DaddyWarbucks](https://github.com/DaddyWarbucks) for championing this feature.
