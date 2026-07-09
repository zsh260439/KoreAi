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
        redirect: '/admin/knowledge'
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
        path: 'architecture',
        name: 'admin-architecture',
        component: () => import('@/views/admin/architecture/index.vue'),
        meta: {
          appShell: 'admin',
          title: '代码地图',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'architecture',
          breadcrumb: ['首页', '代码地图']
        }
      },
      {
        path: 'knowledge-settings',
        name: 'admin-knowledge-settings',
        component: () => import('@/views/admin/knowledge/settings.vue'),
        meta: {
          appShell: 'admin',
          title: '检索参数',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'knowledge-settings',
          breadcrumb: ['首页', '检索参数']
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
          title: '分块详情',
          requiresAuth: false,
          navGroup: '导航',
          navKey: 'knowledge',
          breadcrumb: ['首页', '知识库管理', '文档管理', '分块详情']
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
