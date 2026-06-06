import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/workspace'
  },
  {
    path: '/workspace',
    name: 'workspace',
    component: () => import('@/views/workspace/index.vue'),
    meta: {
      appShell: 'workspace',
      title: 'AI 工作台',
      requiresAuth: false,
      navKey: 'workspace'
    }
  },
  {
    path: '/workspace/:conversationId',
    name: 'workspace-conversation',
    component: () => import('@/views/workspace/index.vue'),
    meta: {
      appShell: 'workspace',
      title: '会话详情',
      requiresAuth: false,
      navKey: 'workspace'
    }
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/layouts/AdminLayout.vue'),
    meta: {
      appShell: 'admin',
      requiresAuth: false
    },
    children: [
      {
        path: '',
        redirect: '/admin/dashboard'
      },
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/dashboard/index.vue'),
        meta: {
          appShell: 'admin',
          title: 'Dashboard',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'dashboard',
          breadcrumb: ['首页', 'Dashboard']
        }
      },
      {
        path: 'knowledge',
        name: 'admin-knowledge',
        component: () => import('@/views/admin/knowledge/index.vue'),
        meta: {
          appShell: 'admin',
          title: '知识库管理',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理']
        }
      },
      {
        path: 'knowledge/:kbId',
        name: 'admin-knowledge-documents',
        component: () => import('@/views/admin/knowledge/documents.vue'),
        meta: {
          appShell: 'admin',
          title: '文档管理',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理', '文档管理']
        }
      },
      {
        path: 'knowledge/:kbId/docs/:docId',
        name: 'admin-document-detail',
        component: () => import('@/views/admin/knowledge/document-detail.vue'),
        meta: {
          appShell: 'admin',
          title: '文档详情',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理', '文档管理', '文档详情']
        }
      },
      {
        path: 'ingestion',
        name: 'admin-ingestion',
        component: () => import('@/views/admin/pipeline/index.vue'),
        meta: {
          appShell: 'admin',
          title: '流水线任务',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'ingestion',
          breadcrumb: ['首页', '流水线任务']
        }
      },
      {
        path: 'traces',
        name: 'admin-traces',
        component: () => import('@/views/admin/trace/index.vue'),
        meta: {
          appShell: 'admin',
          title: '链路追踪',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'traces',
          breadcrumb: ['首页', '链路追踪']
        }
      },
      {
        path: 'traces/:traceId',
        name: 'admin-trace-detail',
        component: () => import('@/views/admin/trace/detail.vue'),
        meta: {
          appShell: 'admin',
          title: '链路详情',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'traces',
          breadcrumb: ['首页', '链路追踪', '链路详情']
        }
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/settings/index.vue'),
        meta: {
          appShell: 'admin',
          title: 'Settings',
          requiresAuth: false,
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

router.beforeEach(() => true)

router.afterEach((to) => {
  const title = to.meta.title ?? 'AI Console'
  const shell = to.meta.appShell

  if (shell === 'admin') {
    document.title = `${title} - AI Console Admin`
    return
  }

  document.title = `${title} - AI Console`
})
