import { Database, Settings2 } from 'lucide-vue-next'

import type { AdminNavItem } from '@/types/navigation'

export const adminNavItems: AdminNavItem[] = [
  {
    title: '知识库管理',
    href: '/admin/knowledge',
    icon: Database
  },
  {
    title: '检索参数',
    href: '/admin/knowledge-settings',
    icon: Settings2
  }
]
