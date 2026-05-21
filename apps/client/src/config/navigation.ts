import {
  ClipboardList,
  Database,
  FolderKanban,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Layers,
  Lightbulb,
  Settings,
  Upload,
  Users,
  Workflow
} from 'lucide-vue-next'

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
        title: '意图管理',
        navKey: 'intent',
        icon: Layers,
        children: [
          {
            title: '意图树配置',
            href: '/admin/intent-tree',
            navKey: 'intent-tree',
            icon: GitBranch
          },
          {
            title: '意图列表',
            href: '/admin/intent-list',
            navKey: 'intent-list',
            icon: ClipboardList
          }
        ]
      },
      {
        title: '数据通道',
        navKey: 'ingestion',
        icon: Upload,
        children: [
          {
            title: '流水线管理',
            href: '/admin/ingestion?tab=pipelines',
            navKey: 'ingestion-pipelines',
            icon: FolderKanban,
            search: '?tab=pipelines'
          },
          {
            title: '流水线任务',
            href: '/admin/ingestion?tab=tasks',
            navKey: 'ingestion-tasks',
            icon: ClipboardList,
            search: '?tab=tasks'
          }
        ]
      },
      {
        title: '关键词映射',
        href: '/admin/mappings',
        navKey: 'mappings',
        icon: KeyRound
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
        title: '用户管理',
        href: '/admin/users',
        navKey: 'users',
        icon: Users
      },
      {
        title: '示例问题',
        href: '/admin/sample-questions',
        navKey: 'sample-questions',
        icon: Lightbulb
      },
      {
        title: '系统设置',
        href: '/admin/settings',
        navKey: 'settings',
        icon: Settings
      }
    ]
  }
]
