import { createApp } from 'vue'
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElUpload
} from 'element-plus'
import { createPinia } from 'pinia'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/menu/style/css'
import 'element-plus/es/components/menu-item/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/upload/style/css'
import App from './App.vue'
import './theme.css'
import { router } from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

for (const component of [
  ElButton,
  ElDialog,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElUpload
]) {
  app.component(component.name!, component)
}

app.mount('#app')
