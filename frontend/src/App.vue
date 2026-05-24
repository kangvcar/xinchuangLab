<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Clock3,
  FileText,
  FlaskConical,
  Leaf,
  Maximize2,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Square,
  Terminal,
} from 'lucide-vue-next'

const apiBase = ''
const experiments = ref([])
const selectedExperimentId = ref('file-basic')
const studentId = ref('stu001')
const activeSession = ref(null)
const logs = ref([])
const aiRecords = ref([])
const command = ref('pwd')
const busy = ref(false)
const reportUrl = ref('')
const statusText = ref('等待启动')
const remainingSeconds = ref(60 * 60)
const activeGuideTab = ref('task')
const analyzingCommand = ref('')
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
const terminalText = computed(() => logs.value.map((item) => item.clean_content).join('\n').toLowerCase())
const completedStepIds = computed(() => {
  const done = new Set()
  for (const step of currentSteps.value) {
    const keywords = step.keywords ?? []
    if (keywords.length && keywords.some((keyword) => terminalText.value.includes(String(keyword).toLowerCase()))) {
      done.add(step.id)
    }
  }
  return done
})
const completedSteps = computed(() => completedStepIds.value.size)
const currentQuestion = computed(() => {
  const nextStep = currentSteps.value.find((step) => !completedStepIds.value.has(step.id))
  return nextStep?.id ?? currentSteps.value.length ?? 1
})
const currentInstruction = computed(() =>
  currentSteps.value.find((step) => step.id === currentQuestion.value) ?? currentSteps.value[0]
)
const progressPercent = computed(() => {
  if (!currentSteps.value.length) return 0
  return Math.round((completedSteps.value / currentSteps.value.length) * 100)
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
})

onBeforeUnmount(() => {
  closeCoachSocket()
  if (timerHandle) window.clearInterval(timerHandle)
})

async function loadExperiments() {
  const response = await fetch(`${apiBase}/api/experiments`)
  experiments.value = await response.json()
  if (experiments.value.length && !selectedExperiment.value) {
    selectedExperimentId.value = experiments.value[0].id
  }
}

async function startSession() {
  busy.value = true
  statusText.value = '正在启动 Docker 实验环境'
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
    analyzingCommand.value = ''
    remainingSeconds.value = 60 * 60
    connectCoachSocket(activeSession.value.id)
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已就绪' : '模拟兜底模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '实验启动失败'
  } finally {
    busy.value = false
  }
}

async function stopSession() {
  if (!activeSession.value) return
  await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/stop`, { method: 'POST' })
  activeSession.value.status = 'stopped'
  statusText.value = '实验已停止'
  closeCoachSocket()
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
    analyzingCommand.value = ''
    connectCoachSocket(activeSession.value.id)
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已重置' : '模拟兜底模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '重置失败'
  } finally {
    busy.value = false
  }
}

async function sendMockCommand() {
  if (!activeSession.value || !command.value.trim()) return
  busy.value = true
  const current = command.value.trim()
  command.value = ''
  try {
    const response = await fetch(`${apiBase}/api/sessions/${activeSession.value.id}/simulate-terminal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: current }),
    })
    const payload = await response.json()
    if (coachSocket?.readyState !== WebSocket.OPEN) {
      if (payload.log) logs.value.push(payload.log)
      if (payload.ai_record) aiRecords.value.push(payload.ai_record)
    }
  } finally {
    busy.value = false
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
          <strong>Linux AI Lab</strong>
          <span>STUDIO</span>
        </div>
      </div>

      <button class="back-button">
        <ArrowLeft :size="17" />
        <span>返回</span>
      </button>

      <nav class="main-nav" aria-label="课程导航">
        <button>学习 <ChevronDown :size="14" /></button>
        <button>练习 <ChevronDown :size="14" /></button>
        <button>挑战 <ChevronDown :size="14" /></button>
        <button>定价</button>
        <button>资源 <ChevronDown :size="14" /></button>
      </nav>

      <button class="signup-button" :disabled="busy" @click="startSession">
        <Leaf :size="16" />
        {{ activeSession ? '运行中' : '开始实验' }}
      </button>
    </header>

    <section class="lab-workbench">
      <aside class="left-stack">
        <section class="task-panel">
          <header class="task-tabs">
            <button :class="{ active: activeGuideTab === 'task' }" @click="activeGuideTab = 'task'">
              <FileText :size="14" style="margin-right:4px" /> 任务
            </button>
            <button :class="{ active: activeGuideTab === 'hint' }" @click="activeGuideTab = 'hint'">
              提示
            </button>
            <button :class="{ active: activeGuideTab === 'solution' }" @click="activeGuideTab = 'solution'">
              思路
            </button>
            <button :class="{ active: activeGuideTab === 'ai' }" @click="activeGuideTab = 'ai'">
              <Bot :size="14" style="margin-right:4px" /> AI 助手
            </button>
            <span class="panel-timer">
              <Clock3 :size="16" />
              {{ timerText }}
            </span>
          </header>

          <div class="task-scroll">
            <template v-if="activeGuideTab === 'task'">
              <p class="question-count">步骤 {{ currentQuestion }} / {{ currentSteps.length || 1 }}</p>
              <div class="question-progress">
                <span
                  v-for="step in currentSteps"
                  :key="step.id"
                  :class="{ done: completedStepIds.has(step.id), current: step.id === currentQuestion }"
                ></span>
              </div>

              <div class="guided-step-card" v-if="currentInstruction">
                <span class="step-eyebrow">{{ runtimeLabel }} · {{ selectedExperiment?.name ?? 'Linux 文件管理基础实验' }}</span>
                <h2>{{ currentInstruction.title }}</h2>
                <p>{{ currentInstruction.goal ?? currentInstruction.hint }}</p>

                <div class="try-block" v-if="currentInstruction.try_commands?.length">
                  <strong>🌱 建议先试试</strong>
                  <div>
                    <code v-for="item in currentInstruction.try_commands" :key="item">{{ item }}</code>
                  </div>
                </div>

                <div class="success-hint">
                  <strong>✅ 完成判断</strong>
                  <span>{{ currentInstruction.success_hint ?? currentInstruction.hint }}</span>
                </div>

                <div class="coach-focus" v-if="currentInstruction.coach_focus">
                  <strong>🎯 陪练关注</strong>
                  <span>{{ currentInstruction.coach_focus }}</span>
                </div>
              </div>

              <div class="step-overview">
                <strong>全部步骤</strong>
                <ol>
                  <li
                    v-for="step in currentSteps"
                    :key="step.id"
                    :class="{ done: completedStepIds.has(step.id), current: step.id === currentQuestion }"
                  >
                    <span>{{ step.title }}</span>
                    <small>{{ step.hint }}</small>
                  </li>
                </ol>
              </div>

              <div class="task-actions">
                <label>
                  <span>学生编号</span>
                  <input v-model="studentId" placeholder="请输入学号" />
                </label>
                <button class="primary-button" :disabled="busy" @click="startSession">
                  <Play :size="16" />
                  {{ busy ? '启动中...' : '启动实验' }}
                </button>
              </div>
            </template>

            <template v-else-if="activeGuideTab === 'hint'">
              <h2>🌿 实验提示</h2>
              <p>先用 <code>pwd</code> 确认当前位置，再用 <code>ls -l</code> 观察目录内容。</p>
              <p>创建目录时建议使用 <code>mkdir linux_lab</code>，创建文件时使用 <code>touch hello.txt</code>。</p>
            </template>

            <template v-else-if="activeGuideTab === 'solution'">
              <h2>💡 参考思路</h2>
              <p>本区域只给出思路，不直接替学生完成实验。请根据左侧步骤在右侧终端逐条执行，并观察 AI 陪练解释。</p>
            </template>

            <template v-else>
              <h2>🤖 AI Assistant</h2>
              <p>AI 会根据右侧 Docker 终端捕获到的真实命令输出，在下方「AI 陪练输出」区域给出即时分析。</p>
            </template>
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
              <p v-for="block in record.ai_response.split('\n\n')" :key="block">{{ block }}</p>
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
          <div class="terminal-tabs">
            <button class="terminal-tab active">{{ terminalTitle }}</button>
            <button class="terminal-tab add" title="新建终端">
              <Plus :size="16" />
            </button>
          </div>

          <div class="terminal-actions">
            <span class="terminal-runtime" v-if="activeSession">Docker · openEuler</span>
            <button :disabled="!activeSession" @click="stopSession">
              <Square :size="13" />
              停止实验
            </button>
            <button title="重置实验" :disabled="!activeSession || busy" @click="resetSession">
              <RefreshCcw :size="16" />
            </button>
            <button title="生成报告" :disabled="!activeSession" @click="generateReport">
              <FileText :size="16" />
            </button>
            <button title="全屏">
              <Maximize2 :size="16" />
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

          <div v-else-if="activeSession" class="mock-terminal">
            <div class="terminal-output">
              <pre v-for="item in logs" :key="item.id">{{ item.clean_content }}</pre>
            </div>
            <form class="command-line" @submit.prevent="sendMockCommand">
              <span>student@lab:~$</span>
              <input v-model="command" :disabled="busy" autocomplete="off" placeholder="输入命令..." />
              <button :disabled="busy">
                <Send :size="16" />
              </button>
            </form>
          </div>

          <div v-else class="terminal-launch">
            <Terminal :size="42" />
            <h1>准备好开始你的 Linux 实验了吗？</h1>
            <p>启动后右侧将进入真实 Docker 容器终端，每次执行命令都会被旁路捕获并发送给 AI 陪练。</p>
            <button class="primary-button" :disabled="busy" @click="startSession">
              <Play :size="17" />
              {{ busy ? '正在启动 Docker...' : '开始实验' }}
            </button>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>
