import { Database, LayoutDashboard, Settings, Upload, Workflow } from 'lucide-vue-next'

import type { AdminNavGroup } from '@/types/navigation'

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: '导航',
    items: [
      {
        title: 'Dashboard',
        href: '/admin/dashboard',
        navKey: 'dashboard',
        icon: LayoutDashboard
      },
      {
        title: '知识库管理',
        href: '/admin/knowledge',
        navKey: 'knowledge',
        icon: Database
      },
      {
        title: '流水线任务',
        href: '/admin/ingestion',
        navKey: 'ingestion',
        icon: Upload
      },
      {
        title: '链路追踪',
        href: '/admin/traces',
        navKey: 'traces',
        icon: Workflow
      }
    ]
  },
  {
    title: '设置',
    items: [
      {
        title: 'Settings',
        href: '/admin/settings',
        navKey: 'settings',
        icon: Settings
      }
    ]
  }
]
