import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

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

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/homeView/index.vue'),
    meta: {
      appShell: 'marketing',
      title: '首页',
      requiresAuth: false
    }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: {
      appShell: 'auth',
      title: '登录',
      requiresAuth: false
    }
  },
  {
    path: '/workspace',
    name: 'workspace',
    component: () => import('@/views/workspaceView/index.vue'),
    meta: {
      appShell: 'workspace',
      title: 'AI 工作台',
      requiresAuth: true,
      navKey: 'workspace'
    }
  },
  {
    path: '/workspace/:sessionId',
    name: 'workspace-session',
    component: () => import('@/views/workspaceView/index.vue'),
    meta: {
      appShell: 'workspace',
      title: '会话详情',
      requiresAuth: true,
      navKey: 'workspace'
    }
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/layouts/AdminLayout.vue'),
    meta: {
      appShell: 'admin',
      requiresAuth: true
    },
    children: [
      {
        path: '',
        redirect: '/admin/dashboard'
      },
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/AdminDashboardView.vue'),
        meta: {
          appShell: 'admin',
          title: 'Dashboard',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'dashboard',
          breadcrumb: ['首页', 'Dashboard']
        }
      },
      {
        path: 'knowledge',
        name: 'admin-knowledge',
        component: () => import('@/views/admin/AdminKnowledgeBasesView.vue'),
        meta: {
          appShell: 'admin',
          title: '知识库管理',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理']
        }
      },
      {
        path: 'knowledge/:kbId',
        name: 'admin-knowledge-documents',
        component: () => import('@/views/admin/AdminDocumentsView.vue'),
        meta: {
          appShell: 'admin',
          title: '文档管理',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理', '文档管理']
        }
      },
      {
        path: 'knowledge/:kbId/docs/:docId',
        name: 'admin-document-detail',
        component: () => import('@/views/admin/AdminDocumentDetailView.vue'),
        meta: {
          appShell: 'admin',
          title: '文档详情',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理', '文档管理', '文档详情']
        }
      },
      {
        path: 'intent-tree',
        name: 'admin-intent-tree',
        component: () => import('@/views/admin/AdminIntentTreeView.vue'),
        meta: {
          appShell: 'admin',
          title: '意图树配置',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'intent-tree',
          breadcrumb: ['首页', '意图管理', '意图树配置']
        }
      },
      {
        path: 'intent-list',
        name: 'admin-intent-list',
        component: () => import('@/views/admin/AdminIntentListView.vue'),
        meta: {
          appShell: 'admin',
          title: '意图列表',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'intent-list',
          breadcrumb: ['首页', '意图管理', '意图列表']
        }
      },
      {
        path: 'ingestion',
        name: 'admin-ingestion',
        component: () => import('@/views/admin/AdminPipelineTasksView.vue'),
        meta: {
          appShell: 'admin',
          title: '数据通道',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'ingestion',
          breadcrumb: ['首页', '数据通道']
        }
      },
      {
        path: 'mappings',
        name: 'admin-mappings',
        component: () => import('@/views/admin/AdminMappingsView.vue'),
        meta: {
          appShell: 'admin',
          title: '关键词映射',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'mappings',
          breadcrumb: ['首页', '关键词映射']
        }
      },
      {
        path: 'traces',
        name: 'admin-traces',
        component: () => import('@/views/admin/AdminTracesView.vue'),
        meta: {
          appShell: 'admin',
          title: '链路追踪',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'traces',
          breadcrumb: ['首页', '链路追踪']
        }
      },
      {
        path: 'traces/:traceId',
        name: 'admin-trace-detail',
        component: () => import('@/views/admin/AdminTraceDetailView.vue'),
        meta: {
          appShell: 'admin',
          title: '链路详情',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'traces',
          breadcrumb: ['首页', '链路追踪', '链路详情']
        }
      },
      {
        path: 'sample-questions',
        name: 'admin-sample-questions',
        component: () => import('@/views/admin/AdminSampleQuestionsView.vue'),
        meta: {
          appShell: 'admin',
          title: '示例问题',
          requiresAuth: true,
          navGroup: '设置',
          navKey: 'sample-questions',
          breadcrumb: ['首页', '示例问题']
        }
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsersView.vue'),
        meta: {
          appShell: 'admin',
          title: '用户管理',
          requiresAuth: true,
          navGroup: '设置',
          navKey: 'users',
          breadcrumb: ['首页', '用户管理']
        }
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/AdminSettingsView.vue'),
        meta: {
          appShell: 'admin',
          title: '系统设置',
          requiresAuth: true,
          navGroup: '设置',
          navKey: 'settings',
          breadcrumb: ['首页', '系统设置']
        }
      }
    ]
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = localStorage.getItem('demo-token')

  if (!to.meta.requiresAuth) {
    if (to.path === '/login' && token) {
      return '/workspace'
    }
    return true
  }

  if (!token) {
    return '/login'
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta.title ?? 'AI Console'
  const shell = to.meta.appShell

  if (shell === 'admin') {
    document.title = `${title} - AI Console Admin`
    return
  }

  if (shell === 'workspace') {
    document.title = `${title} - AI Console`
    return
  }

  document.title = `${title} - AI Console`
})
