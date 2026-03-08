<template>
  <section v-if="pendingRequests.length > 0" class="thread-request-rail" aria-label="Pending thread requests">
    <div class="thread-request-rail-inner" :class="{ 'thread-request-rail-inner--with-queue': hasQueueAbove }">
      <article
        v-for="request in pendingRequests"
        :key="`server-request:${request.id}`"
        class="request-card"
      >
        <p class="request-title">{{ requestHeadline(request) }}</p>
        <p class="request-meta">Request #{{ request.id }} · {{ formatIsoTime(request.receivedAtIso) }}</p>

        <p v-if="readRequestReason(request)" class="request-reason">{{ readRequestReason(request) }}</p>
        <pre v-if="readRequestCommand(request)" class="request-command">{{ readRequestCommand(request) }}</pre>

        <section v-if="isApprovalRequest(request)" class="request-actions">
          <button
            v-for="action in readApprovalActions(request)"
            :key="`${request.id}:${action.key}`"
            type="button"
            class="request-button"
            :class="{ 'request-button-primary': action.primary }"
            @click="onRespondApproval(request, action.payload)"
          >
            {{ action.label }}
          </button>
        </section>

        <section v-else-if="request.method === 'item/tool/requestUserInput'" class="request-user-input">
          <div
            v-for="question in readToolQuestions(request)"
            :key="`${request.id}:${question.id}`"
            class="request-question"
          >
            <p class="request-question-title">{{ question.header || question.question }}</p>
            <p v-if="question.header && question.question" class="request-question-text">{{ question.question }}</p>
            <select
              class="request-select"
              :value="readQuestionAnswer(request.id, question.id, question.options[0] || '')"
              @change="onQuestionAnswerChange(request.id, question.id, $event)"
            >
              <option v-for="option in question.options" :key="`${request.id}:${question.id}:${option}`" :value="option">
                {{ option }}
              </option>
            </select>
            <input
              v-if="question.isOther"
              class="request-input"
              type="text"
              :value="readQuestionOtherAnswer(request.id, question.id)"
              placeholder="Other answer"
              @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
            />
          </div>

          <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(request)">
            Submit Answers
          </button>
        </section>

        <section v-else-if="request.method === 'item/tool/call'" class="request-actions">
          <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(request.id)">Fail Tool Call</button>
          <button type="button" class="request-button" @click="onRespondToolCallSuccess(request.id)">Success (Empty)</button>
        </section>

        <section v-else class="request-actions">
          <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(request.id)">Return Empty Result</button>
          <button type="button" class="request-button" @click="onRejectUnknownRequest(request.id)">Reject Request</button>
        </section>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UiServerRequest } from '../../types/codex'

const props = withDefaults(defineProps<{
  pendingRequests: UiServerRequest[]
  hasQueueAbove?: boolean
}>(), {
  hasQueueAbove: false,
})

const emit = defineEmits<{
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
}>()

const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

type ApprovalAction = {
  key: string
  label: string
  payload: Record<string, unknown>
  primary: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = params?.reason
  return typeof reason === 'string' ? reason.trim() : ''
}

function readRequestCommand(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const command = params?.command
  return typeof command === 'string' ? command.trim() : ''
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval'
    || request.method === 'item/fileChange/requestApproval'
}

function buildApprovalActionLabel(decision: string, payload: Record<string, unknown>): string {
  switch (decision) {
    case 'accept':
      return 'Approve'
    case 'acceptForSession':
      return 'Approve for session'
    case 'acceptWithExecpolicyAmendment': {
      const amendments = Array.isArray(payload.execpolicy_amendment)
        ? payload.execpolicy_amendment.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
      if (amendments.length === 1) {
        return `Approve & remember ${amendments[0]}`
      }
      return 'Approve & remember'
    }
    case 'decline':
      return 'Reject'
    case 'cancel':
      return 'Cancel'
    default:
      return decision
  }
}

function readApprovalActions(request: UiServerRequest): ApprovalAction[] {
  const params = asRecord(request.params)
  const rawDecisions = Array.isArray(params?.availableDecisions) ? params.availableDecisions : []
  const fallbackDecisions: unknown[] = ['accept', 'acceptForSession', 'decline', 'cancel']
  const source = rawDecisions.length > 0 ? rawDecisions : fallbackDecisions

  return source.flatMap((entry, index): ApprovalAction[] => {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      const decision = entry.trim()
      return [{
        key: decision,
        label: buildApprovalActionLabel(decision, {}),
        payload: { decision },
        primary: index === 0 || decision === 'accept',
      }]
    }

    const record = asRecord(entry)
    if (!record) return []
    const [decision, rawPayload] = Object.entries(record)[0] ?? []
    if (typeof decision !== 'string' || decision.trim().length === 0) return []
    const payload = asRecord(rawPayload) ?? {}
    return [{
      key: `${decision}:${index}`,
      label: buildApprovalActionLabel(decision, payload),
      payload: {
        decision,
        ...payload,
      },
      primary: index === 0 || decision === 'accept',
    }]
  })
}

function requestHeadline(request: UiServerRequest): string {
  switch (request.method) {
    case 'item/commandExecution/requestApproval':
      return 'Shell command approval'
    case 'item/fileChange/requestApproval':
      return 'File change approval'
    case 'item/tool/requestUserInput':
      return 'User input requested'
    case 'item/tool/call':
      return 'Tool call pending'
    default:
      return request.method
  }
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => option?.label)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onRespondApproval(request: UiServerRequest, payload: Record<string, unknown>): void {
  emit('respondServerRequest', {
    id: request.id,
    result: payload,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0] || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-request-rail {
  @apply w-full max-w-175 mx-auto px-2 sm:px-6;
}

.thread-request-rail-inner {
  @apply flex flex-col gap-2 rounded-t-2xl border-x border-t border-amber-300 bg-amber-50/70 px-3 py-3;
}

.thread-request-rail-inner--with-queue {
  @apply rounded-none border-t-0;
}

.request-card {
  @apply w-full rounded-xl border border-amber-300 bg-amber-50 px-3 sm:px-4 py-2 sm:py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap;
}

.request-command {
  @apply m-0 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-950 whitespace-pre-wrap;
}

.request-actions {
  @apply flex flex-wrap gap-1.5 sm:gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}
</style>
