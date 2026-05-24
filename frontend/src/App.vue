<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  FlaskConical,
  Maximize2,
  Play,
  RefreshCcw,
  Square,
  Terminal,
} from 'lucide-vue-next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { marked } from 'marked'

const apiBase = ''
const experiments = ref([])
const selectedExperimentId = ref('file-basic')
const studentId = ref('stu001')
const activeSession = ref(null)
const logs = ref([])
const aiRecords = ref([])
const stepProgress = ref([])
const stepList = ref([])
const busy = ref(false)
const reportUrl = ref('')
const statusText = ref('等待启动')
const remainingSeconds = ref(60 * 60)
const analyzingCommand = ref('')
const activeStepId = ref(null)
const termContainer = ref(null)
let term = null
let coachSocket = null
let timerHandle = null

const selectedExperiment = computed(() =>
  experiments.value.find((item) => item.id === selectedExperimentId.value)
)
const currentSteps = computed(() => selectedExperiment.value?.task_config?.steps ?? [])
const hasTerminalFrame = computed(() => Boolean(activeSession.value?.terminal_url))
const runtimeLabel = computed(() => {
  if (!activeSession.value) return '未启动'
  return activeSession.value.runtime_mode === 'docker' ? 'Docker 容器' : '模拟兜底'
})

const stepProgressMap = computed(() => {
  const map = new Map()
  for (const p of stepProgress.value) {
    map.set(p.step_id, p.status)
  }
  return map
})

const completedStepIds = computed(() => {
  const done = new Set()
  for (const p of stepProgress.value) {
    if (p.status === 'completed' || p.status === 'confirmed') {
      done.add(p.step_id)
    }
  }
  return done
})

const confirmedStepIds = computed(() => {
  const confirmed = new Set()
  for (const p of stepProgress.value) {
    if (p.status === 'confirmed') {
      confirmed.add(p.step_id)
    }
  }
  return confirmed
})

const currentQuestion = computed(() => {
  const nextStep = currentSteps.value.find((step) => {
    const status = stepProgressMap.value.get(step.id)
    return status !== 'confirmed'
  })
  return nextStep?.id ?? currentSteps.value.length ?? 1
})

const displayedStepId = computed(() => activeStepId.value ?? currentQuestion.value)

const displayedStep = computed(() =>
  currentSteps.value.find((step) => step.id === displayedStepId.value) ?? currentSteps.value[0]
)

const displayedStepStatus = computed(() => {
  if (!displayedStep.value) return 'locked'
  return stepProgressMap.value.get(displayedStep.value.id) ?? 'locked'
})

const progressPercent = computed(() => {
  if (!currentSteps.value.length) return 0
  return Math.round((confirmedStepIds.value.size / currentSteps.value.length) * 100)
})

const timerText = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const terminalTitle = computed(() => hasTerminalFrame.value ? 'Terminal 1' : 'Terminal Preview')

onMounted(async () => {
  await loadExperiments()
  timerHandle = window.setInterval(() => {
    if (activeSession.value && remainingSeconds.value > 0) {
      remainingSeconds.value -= 1
    }
  }, 1000)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  closeCoachSocket()
  destroyXterm()
  if (timerHandle) window.clearInterval(timerHandle)
  window.removeEventListener('resize', onWindowResize)
})

watch(
  () => activeSession.value,
  (session) => {
    if (session && !session.terminal_url) {
      nextTick(() => initXterm())
    } else {
      destroyXterm()
    }
  }
)

function onWindowResize() {
  if (term) {
    const fitAddon = term._fitAddon
    if (fitAddon) fitAddon.fit()
  }
}

function initXterm() {
  if (term) {
    destroyXterm()
  }
  if (!termContainer.value) return
  term = new XTerm({
    cursorBlink: true,
    fontFamily: "'Cascadia Mono', 'Consolas', 'Fira Code', monospace",
    fontSize: 14,
    theme: {
      background: '#1f180f',
      foreground: '#f3f4f6',
      cursor: '#f3f4f6',
      selectionBackground: '#4a3f32',
      black: '#2b2118',
      red: '#e05a5a',
      green: '#a8d4a0',
      yellow: '#f5c31c',
      blue: '#7eb8da',
      magenta: '#c8a0c8',
      cyan: '#88d8d8',
      white: '#f3f4f6',
    },
    scrollback: 1000,
    allowProposedApi: false,
  })
  const fitAddon = new FitAddon()
  term._fitAddon = fitAddon
  term.loadAddon(fitAddon)
  term.open(termContainer.value)
  fitAddon.fit()

  let inputBuffer = ''
  term.onData((data) => {
    const code = data.charCodeAt(0)
    if (data === '\r' || data === '\n') {
      term.write('\r\n')
      if (inputBuffer.trim()) {
        sendMockCommand(inputBuffer.trim())
      } else {
        term.write('student@lab:~$ ')
      }
      inputBuffer = ''
    } else if (code === 127) {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1)
        term.write('\b \b')
      }
    } else if (code < 32) {
      // ignore other control chars
    } else {
      inputBuffer += data
      term.write(data)
    }
  })

  term.write('student@lab:~$ ')
}

function destroyXterm() {
  if (term) {
    term.dispose()
    term = null
  }
}

function writeToXterm(text) {
  if (term) {
    term.write(text)
  }
}

function renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text, {
    breaks: true,
    gfm: true,
  })
}

async function loadExperiments() {
  const response = await fetch(`${apiBase}/api/experiments`)
  experiments.value = await response.json()
  if (experiments.value.length && !selectedExperiment.value) {
    selectedExperimentId.value = experiments.value[0].id
  }
}

async function startSession() {
  busy.value = true
  statusText.value = '正在启动实验环境'
  reportUrl.value = ''
  try {
    const response = await fetch(`${apiBase}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId.value,
        experiment_id: selectedExperimentId.value,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.detail || '创建实训会话失败')
    }
    activeSession.value = await response.json()
    logs.value = []
    aiRecords.value = []
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
    analyzingCommand.value = ''
    remainingSeconds.value = 60 * 60
    connectCoachSocket(activeSession.value.id)
    await loadStepProgress()
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已就绪' : '模拟兜底模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '实验启动失败'
  } finally {
    busy.value = false
  }
}

async function stopSession() {
  if (!activeSession.value) return
  try {
    const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/stop`, { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.detail || '停止实验失败')
    }
    activeSession.value = null
    statusText.value = '实验已停止'
    closeCoachSocket()
    destroyXterm()
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '停止实验失败'
  }
}

async function resetSession() {
  if (!activeSession.value) return
  busy.value = true
  statusText.value = '正在重置实验环境'
  try {
    const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/reset`, { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.detail || '重置实验失败')
    }
    activeSession.value = await response.json()
    logs.value = []
    aiRecords.value = []
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
    analyzingCommand.value = ''
    connectCoachSocket(activeSession.value.id)
    await loadStepProgress()
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已重置' : '模拟兜底模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '重置失败'
  } finally {
    busy.value = false
  }
}

async function sendMockCommand(cmd) {
  if (!activeSession.value || !cmd.trim()) return
  busy.value = true
  try {
    const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/simulate-terminal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd.trim() }),
    })
    const payload = await response.json()
    // AI 分析结果通过 WebSocket 异步推送，不再从 API 响应中读取
    if (payload.log?.clean_content) {
      const lines = payload.log.clean_content.split('\n')
      // 第一行是 prompt+command，已由 xterm 本地回显显示，跳过
      const output = lines.slice(1).join('\r\n')
      if (output) {
        writeToXterm(output + '\r\n')
      }
      writeToXterm('student@lab:~$ ')
    }
    await loadStepProgress()
  } finally {
    busy.value = false
  }
}

async function loadStepProgress() {
  if (!activeSession.value) return
  try {
    const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/steps`)
    if (!response.ok) return
    const payload = await response.json()
    stepProgress.value = payload.progress ?? []
    stepList.value = payload.steps ?? []
  } catch {
    // silent fail
  }
}

async function confirmStep(stepId) {
  if (!activeSession.value) return
  try {
    const response = await fetch(
      `${apiBase}/api/sessions/${activeSession.value.id}/steps/${stepId}/confirm`,
      { method: 'POST' }
    )
    if (!response.ok) return
    const payload = await response.json()
    stepProgress.value = payload.progress ?? stepProgress.value
    activeStepId.value = null
  } catch {
    // silent fail
  }
}

async function generateReport() {
  if (!activeSession.value) return
  const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/report`, { method: 'POST' })
  if (!response.ok) return
  const payload = await response.json()
  reportUrl.value = payload.url
  window.open(payload.url, '_blank')
}

function selectStep(stepId) {
  const status = stepProgressMap.value.get(stepId)
  if (status === 'locked' || !status) return
  activeStepId.value = stepId === currentQuestion.value ? null : stepId
}

function connectCoachSocket(sessionId) {
  closeCoachSocket()
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  coachSocket = new WebSocket(`${protocol}//${window.location.host}/ws/ai-coach/${sessionId}`)
  coachSocket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.type === 'terminal_log') {
      logs.value.push(message.payload)
    }
    if (message.type === 'ai_pending') {
      analyzingCommand.value = message.payload?.command ?? '刚才的命令'
    }
    if (message.type === 'ai_coach') {
      analyzingCommand.value = ''
      aiRecords.value.push(message.payload)
    }
    if (message.type === 'step_completed') {
      loadStepProgress()
    }
  }
}

function closeCoachSocket() {
  if (coachSocket) {
    coachSocket.close()
    coachSocket = null
  }
}
</script>

<template>
  <main class="kk-shell">
    <header class="kk-topbar">
      <div class="brand-block">
        <div class="brand-orbit">
          <FlaskConical :size="21" />
        </div>
        <div>
          <strong>信创Linux AI实时陪练实训平台</strong>
        </div>
      </div>

      <div class="topbar-right">
        <span class="session-timer" v-if="activeSession">
          <Clock3 :size="15" />
          {{ timerText }}
        </span>
        <button
          class="status-pill"
          :class="{ active: activeSession }"
          :disabled="activeSession || busy"
          @click="startSession"
        >
          <span class="status-dot" :class="{ running: activeSession }"></span>
          {{ activeSession ? '运行中' : busy ? '启动中...' : '开始实验' }}
        </button>
      </div>
    </header>

    <section class="lab-workbench">
      <aside class="left-stack">
        <section class="task-panel">
          <header class="step-nav">
            <button
              v-for="step in currentSteps"
              :key="step.id"
              class="step-nav-item"
              :class="{
                current: step.id === currentQuestion,
                completed: stepProgressMap.get(step.id) === 'completed',
                confirmed: stepProgressMap.get(step.id) === 'confirmed',
                locked: !stepProgressMap.has(step.id) || stepProgressMap.get(step.id) === 'locked',
              }"
              :disabled="!stepProgressMap.has(step.id) || stepProgressMap.get(step.id) === 'locked'"
              @click="selectStep(step.id)"
            >
              <span class="step-num">{{ step.id }}</span>
              <span class="step-title">{{ step.title }}</span>
              <CheckCircle2 v-if="stepProgressMap.get(step.id) === 'confirmed'" :size="12" class="step-check" />
            </button>

          </header>

          <div class="task-scroll">
            <div class="guided-step-card" :class="{ 'completed-glow': displayedStepStatus === 'completed' }" v-if="displayedStep">
              <span class="step-eyebrow">{{ runtimeLabel }} · {{ selectedExperiment?.name ?? 'Linux 文件管理基础实验' }}</span>
              <h2>{{ displayedStep.title }}</h2>
              <p>{{ displayedStep.goal ?? displayedStep.hint }}</p>

              <div class="try-block" v-if="displayedStep.try_commands?.length">
                <strong>🌱 建议先试试</strong>
                <div>
                  <code v-for="item in displayedStep.try_commands" :key="item">{{ item }}</code>
                </div>
              </div>

              <div class="success-hint">
                <strong>✅ 完成判断</strong>
                <span>{{ displayedStep.success_hint ?? displayedStep.hint }}</span>
              </div>

              <div class="coach-focus" v-if="displayedStep.coach_focus">
                <strong>🎯 陪练关注</strong>
                <span>{{ displayedStep.coach_focus }}</span>
              </div>

              <div class="step-actions" v-if="displayedStepStatus === 'completed'">
                <button class="primary-button next-step-btn" @click="confirmStep(displayedStep.id)">
                  <ArrowRight :size="16" />
                  下一步
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="coach-panel">
          <header class="coach-head">
            <div>
              <Bot :size="18" />
              <strong>AI 陪练输出</strong>
            </div>
            <span>{{ statusText }}</span>
          </header>

          <div class="coach-scroll">
            <article v-for="record in aiRecords" :key="record.id" class="coach-message">
              <time>{{ record.created_at }}</time>
              <div class="coach-md" v-html="renderMarkdown(record.ai_response)"></div>
            </article>

            <article v-if="analyzingCommand" class="coach-pending">
              <Bot :size="20" />
              <div>
                <strong>正在分析：{{ analyzingCommand }}</strong>
                <span>我会结合终端输出和当前实验步骤，给你一段有针对性的陪练反馈。</span>
              </div>
            </article>

            <article v-if="!aiRecords.length && !analyzingCommand" class="coach-empty">
              <Bot :size="32" />
              <strong>等待第一条终端日志</strong>
              <span>在右侧终端执行命令后，AI 会实时分析操作、输出和下一步建议。</span>
            </article>
          </div>
        </section>
      </aside>

      <section class="terminal-panel">
        <header class="terminal-head">
          <div class="terminal-info" v-if="activeSession">
            <span class="terminal-exp-name">{{ selectedExperiment?.name ?? 'Linux 实验' }}</span>
            <span class="terminal-runtime">{{ runtimeLabel }}</span>
          </div>
          <div class="terminal-info-placeholder" v-else></div>

          <div class="terminal-actions">
            <button :disabled="!activeSession" @click="stopSession" title="停止实验">
              <Square :size="13" />
              停止
            </button>
            <button title="重置实验" :disabled="!activeSession || busy" @click="resetSession">
              <RefreshCcw :size="16" />
            </button>
            <button title="生成报告" :disabled="!activeSession" @click="generateReport">
              <FileText :size="16" />
            </button>
          </div>
        </header>

        <div class="terminal-body">
          <iframe
            v-if="hasTerminalFrame"
            class="terminal-frame"
            :src="activeSession.terminal_url"
            title="openEuler terminal"
          />

          <div v-else-if="activeSession" ref="termContainer" class="xterm-container"></div>

          <div v-else class="terminal-launch">
            <div class="terminal-launch-icon">
              <Terminal :size="36" />
            </div>
            <h1>Linux 实验终端</h1>
            <button class="primary-button launch-btn" :disabled="busy" @click="startSession">
              <Play :size="17" />
              {{ busy ? '正在启动...' : '开始实验' }}
            </button>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>
