<template>
  <div class="server-picker">
    <span class="server-picker-prefix">Server</span>
    <select
      v-if="normalizedOptions.length > 1"
      class="server-picker-select"
      :value="modelValue"
      @change="onChange"
    >
      <option
        v-for="option in normalizedOptions"
        :key="option.id || option.label"
        :value="option.id"
        :title="option.description || option.label"
      >
        {{ option.label }}
      </option>
    </select>
    <span v-else class="server-picker-static" :title="selectedDescription || selectedLabel">
      {{ selectedLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type ServerPickerOption = {
  id: string
  label: string
  description?: string
}

const props = defineProps<{
  modelValue: string
  options: ServerPickerOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const fallbackOption: ServerPickerOption = { id: '', label: 'Default server', description: '' }

const normalizedOptions = computed<ServerPickerOption[]>(() => {
  return props.options.length > 0 ? props.options : [fallbackOption]
})

const selectedOption = computed<ServerPickerOption>(() => {
  return normalizedOptions.value.find((option) => option.id === props.modelValue)
    ?? normalizedOptions.value[0]
    ?? fallbackOption
})

const selectedLabel = computed(() => selectedOption.value.label)
const selectedDescription = computed(() => selectedOption.value.description ?? '')

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? ''
  emit('update:modelValue', value)
}
</script>

<style scoped>
@reference "tailwindcss";

.server-picker {
  @apply flex items-center gap-1.5 min-w-0;
}

.server-picker-prefix {
  @apply text-[11px] uppercase tracking-[0.06em] text-zinc-400 shrink-0;
}

.server-picker-select {
  @apply max-w-[15rem] min-w-[7rem] h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none transition focus:border-zinc-400;
}

.server-picker-static {
  @apply text-xs text-zinc-600 truncate;
}
</style>
