import { Database } from 'lucide-vue-next'

import type { AdminNavGroup } from '@/types'

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: '管理',
    items: [
      {
        title: '知识库管理',
        href: '/admin/knowledge',
        navKey: 'knowledge',
        icon: Database
      }
    ]
  }
]
