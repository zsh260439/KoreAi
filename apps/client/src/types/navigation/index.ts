import type { Component } from 'vue'

export interface AdminNavItem {
  title: string
  href?: string
  navKey: string
  icon?: Component
  search?: string
  children?: AdminNavItem[]
}

export interface AdminNavGroup {
  title: string
  items: AdminNavItem[]
}
