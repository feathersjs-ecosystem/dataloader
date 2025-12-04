import { feathers, type Application, type HookContext } from '@feathersjs/feathers'
import { MemoryService } from '@feathersjs/memory'

const postsStore = {
  1: { id: 1, body: 'John post', userId: 101, starIds: [102, 103, 104] },
  2: { id: 2, body: 'Marshall post', userId: 102, starIds: [101, 103, 104] },
  3: { id: 3, body: 'Barbara post', userId: 103 },
  4: { id: 4, body: 'Aubree post', userId: 104 }
}

const commentsStore = {
  11: { id: 11, text: 'John post Marshall comment 11', postId: 1, userId: 102 },
  12: { id: 12, text: 'John post Marshall comment 12', postId: 1, userId: 102 },
  13: { id: 13, text: 'John post Marshall comment 13', postId: 1, userId: 102 },
  14: { id: 14, text: 'Marshall post John comment 14', postId: 2, userId: 101 },
  15: { id: 15, text: 'Marshall post John comment 15', postId: 2, userId: 101 },
  16: { id: 16, text: 'Barbara post John comment 16', postId: 3, userId: 101 },
  17: { id: 17, text: 'Aubree post Marshall comment 17', postId: 4, userId: 102 }
}

const usersStore = {
  101: { id: 101, name: 'John' },
  102: { id: 102, name: 'Marshall' },
  103: { id: 103, name: 'Barbara' },
  104: { id: 104, name: 'Aubree' }
}

export function makeApp(): Application {
  const app = feathers()
  app.use('posts', new MemoryService({ store: { ...postsStore }, startId: 5 }))
  app.use('comments', new MemoryService({ store: { ...commentsStore }, startId: 18 }))
  app.use('users', new MemoryService({ store: { ...usersStore }, startId: 105 }))

  const callbackHook = async (
    context: HookContext & { params: { callback?: (context: HookContext) => Promise<void> } }
  ) => {
    if (context.params.callback) {
      await context.params.callback(context)
    }
    return context
  }

  app.hooks({
    before: {
      all: [callbackHook]
    }
  })

  return app
}
