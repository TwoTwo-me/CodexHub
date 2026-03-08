<template>
  <template v-for="(segment, index) in segments" :key="`${segment.kind}:${index}`">
    <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
    <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">
      {{ segment.label }}
    </a>
    <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
      {{ segment.displayName }}
    </a>
    <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
    <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
    <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
    <s v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</s>
  </template>
</template>

<script setup lang="ts">
defineProps<{
  segments: Array<
    | { kind: 'text'; value: string }
    | { kind: 'link'; label: string; href: string }
    | { kind: 'file'; value: string; displayName: string }
    | { kind: 'code'; value: string }
    | { kind: 'strong'; value: string }
    | { kind: 'em'; value: string }
    | { kind: 'strike'; value: string }
  >
}>()
</script>
