import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/workspace'
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
        path: 'ingestion',
        name: 'admin-ingestion',
        component: () => import('@/views/admin/AdminPipelineTasksView.vue'),
        meta: {
          appShell: 'admin',
          title: '流水线任务',
          requiresAuth: true,
          navGroup: '导航',
          navKey: 'ingestion',
          breadcrumb: ['首页', '流水线任务']
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
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/AdminSettingsView.vue'),
        meta: {
          appShell: 'admin',
          title: 'Settings',
          requiresAuth: true,
          navGroup: '设置',
          navKey: 'settings',
          breadcrumb: ['首页', 'Settings']
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
