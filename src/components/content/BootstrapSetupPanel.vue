<template>
  <section class="bootstrap-setup-panel">
    <div class="bootstrap-setup-card">
      <p class="bootstrap-setup-eyebrow">Initial security setup</p>
      <h1 class="bootstrap-setup-title">Change your admin credentials</h1>
      <p class="bootstrap-setup-body">
        Before using the Hub, choose a new administrator username and password for
        <strong>{{ currentUsername }}</strong>.
      </p>

      <form class="bootstrap-setup-form" @submit.prevent="void submitSetup()">
        <label class="bootstrap-setup-field">
          <span class="bootstrap-setup-label">Current password</span>
          <input
            v-model="currentPassword"
            class="bootstrap-setup-input"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <label class="bootstrap-setup-field">
          <span class="bootstrap-setup-label">New admin username</span>
          <input
            v-model="newUsername"
            class="bootstrap-setup-input"
            type="text"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            required
          />
        </label>

        <label class="bootstrap-setup-field">
          <span class="bootstrap-setup-label">New password</span>
          <input
            v-model="newPassword"
            class="bootstrap-setup-input"
            type="password"
            autocomplete="new-password"
            required
          />
        </label>

        <label class="bootstrap-setup-field">
          <span class="bootstrap-setup-label">Confirm new password</span>
          <input
            v-model="confirmPassword"
            class="bootstrap-setup-input"
            type="password"
            autocomplete="new-password"
            required
          />
        </label>

        <p v-if="errorMessage" class="bootstrap-setup-error">{{ errorMessage }}</p>
        <p v-if="successMessage" class="bootstrap-setup-success">{{ successMessage }}</p>

        <button type="submit" class="bootstrap-setup-submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Applying changes…' : 'Complete setup' }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  currentUsername: string
}>()

const emit = defineEmits<{
  completed: []
}>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const currentPassword = ref('')
const newUsername = ref(props.currentUsername)
const newPassword = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function submitSetup(): Promise<void> {
  if (isSubmitting.value) return

  errorMessage.value = ''
  successMessage.value = ''

  const trimmedUsername = newUsername.value.trim()
  if (!trimmedUsername) {
    errorMessage.value = 'Choose a new admin username.'
    return
  }
  if (trimmedUsername === props.currentUsername.trim()) {
    errorMessage.value = 'Choose a different admin username before continuing.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'New password confirmation does not match.'
    return
  }
  if (newPassword.value === currentPassword.value) {
    errorMessage.value = 'Choose a different password before continuing.'
    return
  }

  isSubmitting.value = true
  try {
    const response = await fetch('/auth/bootstrap/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newUsername: trimmedUsername,
        newPassword: newPassword.value,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = asRecord(payload)?.error
      errorMessage.value = typeof message === 'string' && message.trim().length > 0
        ? message
        : 'Unable to complete admin setup.'
      return
    }

    successMessage.value = 'Admin credentials updated successfully.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    emit('completed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to complete admin setup.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.bootstrap-setup-panel {
  @apply flex-1 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8;
}

.bootstrap-setup-card {
  @apply w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 flex flex-col gap-4;
}

.bootstrap-setup-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500;
}

.bootstrap-setup-title {
  @apply m-0 text-2xl font-semibold text-zinc-950;
}

.bootstrap-setup-body {
  @apply m-0 text-sm leading-6 text-zinc-600;
}

.bootstrap-setup-form {
  @apply flex flex-col gap-4;
}

.bootstrap-setup-field {
  @apply flex flex-col gap-1.5;
}

.bootstrap-setup-label {
  @apply text-sm font-medium text-zinc-800;
}

.bootstrap-setup-input {
  @apply rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-0;
}

.bootstrap-setup-error {
  @apply m-0 text-sm text-rose-600;
}

.bootstrap-setup-success {
  @apply m-0 text-sm text-emerald-600;
}

.bootstrap-setup-submit {
  @apply rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60;
}
</style>
