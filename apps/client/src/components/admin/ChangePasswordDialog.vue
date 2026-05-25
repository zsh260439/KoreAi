<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')

const closeDialog = () => {
  emit('update:open', false)
}

const submit = () => {
  currentPassword.value = ''
  nextPassword.value = ''
  confirmPassword.value = ''
  emit('update:open', false)
}
</script>

<template>
  <el-dialog
    :model-value="open"
    @update:model-value="emit('update:open', $event)"
    title="修改密码"
    :width="480"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    center
  >
    <p class="mb-6 text-sm text-slate-500">
      更新当前账户的登录密码。
    </p>

    <el-form label-position="top" class="space-y-4">
      <el-form-item label="当前密码">
        <el-input
          v-model="currentPassword"
          type="password"
          placeholder="输入当前密码"
          show-password
        />
      </el-form-item>

      <el-form-item label="新密码">
        <el-input
          v-model="nextPassword"
          type="password"
          placeholder="输入新密码"
          show-password
        />
      </el-form-item>

      <el-form-item label="确认新密码">
        <el-input
          v-model="confirmPassword"
          type="password"
          placeholder="再次输入新密码"
          show-password
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
