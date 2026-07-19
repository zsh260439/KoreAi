/// <reference types="vite/client" />

declare module '@vue-office/docx/lib/v3/vue-office-docx.mjs' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{ src: string }>
  export default component
}
