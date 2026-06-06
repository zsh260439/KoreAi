<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <div class="placeholder-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-gray-300"
        >
          <path d="M12 6V2H8" />
          <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
        </svg>
      </div>
      <h2 class="placeholder-title">功能待开发...</h2>
      <p class="placeholder-desc">The feature for this page is under development.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Placeholder page - feature pending development
</script>

<style scoped>
.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.placeholder-content {
  text-align: center;
  padding: 2rem;
}

.placeholder-icon {
  margin-bottom: 1.5rem;
}

.placeholder-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.placeholder-desc {
  font-size: 0.875rem;
  color: #9ca3af;
}
</style>
