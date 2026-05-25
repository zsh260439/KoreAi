declare module 'vue-router' {
  interface RouteMeta {
    appShell: 'marketing' | 'auth' | 'workspace' | 'admin'
    title?: string
    requiresAuth?: boolean
    breadcrumb?: string[]
    navGroup?: string
    navKey?: string
    keepAlive?: boolean
  }
}
