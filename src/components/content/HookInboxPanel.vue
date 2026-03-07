<template>
  <section class="hook-inbox-panel">
    <header class="hook-inbox-header">
      <div>
        <p class="hook-inbox-eyebrow">Hooks</p>
        <h2 class="hook-inbox-title">Pending hooks</h2>
        <p class="hook-inbox-subtitle">Review pending Codex App Server requests for the current server and jump to the affected thread.</p>
      </div>
      <span class="hook-inbox-count">{{ entries.length }}</span>
    </header>

    <p v-if="entries.length === 0" class="hook-inbox-empty">No pending hooks for this server.</p>

    <ul v-else class="hook-inbox-list">
      <li v-for="entry in entries" :key="`${entry.serverId}:${entry.requestId}`">
        <button class="hook-inbox-item" type="button" @click="$emit('open-thread', entry.threadId)">
          <span class="hook-inbox-item-top">
            <span class="hook-inbox-dot" />
            <span class="hook-inbox-thread">{{ entry.threadTitle }}</span>
          </span>
          <span class="hook-inbox-meta">{{ entry.projectName }} · {{ entry.method }}</span>
          <span class="hook-inbox-time">{{ formatReceivedAt(entry.receivedAtIso) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { UiHookInboxEntry } from '../../types/codex'

const props = defineProps<{
  entries: UiHookInboxEntry[]
}>()

defineEmits<{
  (event: 'open-thread', threadId: string): void
}>()

function formatReceivedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return value
  return parsed.toLocaleString()
}
</script>

<style scoped>
.hook-inbox-panel {
  display: grid;
  gap: 16px;
}

.hook-inbox-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.hook-inbox-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b91c1c;
}

.hook-inbox-title {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.hook-inbox-subtitle {
  margin: 8px 0 0;
  color: #4b5563;
}

.hook-inbox-count {
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
}

.hook-inbox-empty {
  margin: 0;
  padding: 20px;
  border-radius: 16px;
  background: #f9fafb;
  color: #6b7280;
}

.hook-inbox-list {
  display: grid;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.hook-inbox-item {
  width: 100%;
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px solid #fecaca;
  border-radius: 16px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.hook-inbox-item:hover {
  border-color: #f87171;
  box-shadow: 0 10px 30px rgb(248 113 113 / 0.12);
}

.hook-inbox-item-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hook-inbox-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #dc2626;
  flex: 0 0 auto;
}

.hook-inbox-thread {
  font-weight: 700;
  color: #111827;
}

.hook-inbox-meta,
.hook-inbox-time {
  color: #6b7280;
  font-size: 14px;
}
</style>
