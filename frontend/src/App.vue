<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  FlaskConical,
  Play,
  RefreshCcw,
  Square,
  Terminal,
  Upload,
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
const terminalFrameKey = ref(0)
const terminalFrameLoaded = ref(false)
const terminalFrameFailed = ref(false)
const showAdmin = ref(false)
const adminDraft = ref(null)
const adminStepsText = ref('')
const adminContainerSpecText = ref('')
const importText = ref('')
const importFile = ref(null)
const importWarnings = ref([])
const importRawOutput = ref('')
const adminStatus = ref('')
const currentBuildId = ref('')
const buildStatus = ref('')
const buildLogs = ref('')
const buildError = ref('')
const buildDockerfile = ref('')
const currentPath = ref(window.location.pathname)
let term = null
let coachSocket = null
let timerHandle = null
let terminalFrameTimer = null
let buildPollTimer = null

const selectedExperiment = computed(() =>
  experiments.value.find((item) => item.id === selectedExperimentId.value)
)
const currentSteps = computed(() => selectedExperiment.value?.task_config?.steps ?? [])
const hasTerminalFrame = computed(() => Boolean(activeSession.value?.terminal_url))
const isTeacherRoute = computed(() => currentPath.value.replace(/\/+$/, '') === '/teacher')
const isBuildRunning = computed(() => buildStatus.value === 'queued' || buildStatus.value === 'running')
const runtimeLabel = computed(() => {
  if (!activeSession.value) return '未启动'
  return activeSession.value.runtime_mode === 'docker' ? 'Docker 容器' : '模拟模式'
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
  if (isTeacherRoute.value) {
    openAdminPanel()
  }
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
  clearTerminalFrameWatch()
  clearBuildPolling()
  window.removeEventListener('resize', onWindowResize)
})

watch(
  () => activeSession.value,
  (session) => {
    if (session?.terminal_url) {
      destroyXterm()
      armTerminalFrameWatch()
    } else if (session) {
      clearTerminalFrameWatch()
      nextTick(() => initXterm())
    } else {
      clearTerminalFrameWatch()
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

function armTerminalFrameWatch() {
  clearTerminalFrameWatch()
  terminalFrameLoaded.value = false
  terminalFrameFailed.value = false
  terminalFrameTimer = window.setTimeout(() => {
    if (!terminalFrameLoaded.value && hasTerminalFrame.value) {
      terminalFrameFailed.value = true
    }
  }, 5000)
}

function clearTerminalFrameWatch() {
  if (terminalFrameTimer) {
    window.clearTimeout(terminalFrameTimer)
    terminalFrameTimer = null
  }
  terminalFrameLoaded.value = false
  terminalFrameFailed.value = false
}

function onTerminalFrameLoad() {
  terminalFrameLoaded.value = true
  terminalFrameFailed.value = false
  if (terminalFrameTimer) {
    window.clearTimeout(terminalFrameTimer)
    terminalFrameTimer = null
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

function clearSessionState() {
  activeSession.value = null
  logs.value = []
  aiRecords.value = []
  stepProgress.value = []
  stepList.value = []
  activeStepId.value = null
  analyzingCommand.value = ''
  reportUrl.value = ''
  terminalFrameKey.value += 1
  clearTerminalFrameWatch()
  closeCoachSocket()
  destroyXterm()
}

async function stopActiveSession() {
  if (!activeSession.value) return
  const sessionId = activeSession.value.id
  const response = await fetch(`${apiBase}/api/sessions/${sessionId}/stop`, { method: 'POST' })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || '停止实验失败')
  }
  clearSessionState()
}

async function switchExperiment(event) {
  const nextExperimentId = event.target.value
  if (!nextExperimentId || nextExperimentId === selectedExperimentId.value || busy.value) return
  const previousExperimentId = selectedExperimentId.value
  busy.value = true
  statusText.value = '正在切换实验模块'
  try {
    if (activeSession.value) {
      await stopActiveSession()
    } else {
      clearSessionState()
    }
    selectedExperimentId.value = nextExperimentId
    statusText.value = '已切换实验模块'
  } catch (error) {
    selectedExperimentId.value = previousExperimentId
    statusText.value = error instanceof Error ? error.message : '切换实验失败'
  } finally {
    busy.value = false
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
    terminalFrameKey.value += 1
    logs.value = []
    aiRecords.value = []
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
    analyzingCommand.value = ''
    remainingSeconds.value = 60 * 60
    connectCoachSocket(activeSession.value.id)
    await loadStepProgress()
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已就绪' : '模拟模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '实验启动失败'
  } finally {
    busy.value = false
  }
}

async function stopSession() {
  if (!activeSession.value) return
  busy.value = true
  statusText.value = '正在停止实验环境'
  try {
    await stopActiveSession()
    statusText.value = '实验已停止'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '停止实验失败'
  } finally {
    busy.value = false
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
    terminalFrameKey.value += 1
    logs.value = []
    aiRecords.value = []
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
    analyzingCommand.value = ''
    connectCoachSocket(activeSession.value.id)
    await loadStepProgress()
    statusText.value = activeSession.value.runtime_mode === 'docker' ? '实验环境已重置' : '模拟模式'
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '重置失败'
    activeSession.value = null
    closeCoachSocket()
    destroyXterm()
    stepProgress.value = []
    stepList.value = []
    activeStepId.value = null
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
      const outputLines = lines.slice(1).filter((line) => !/^student@lab:~[$#]\s*$/.test(line.trim()))
      const output = outputLines.join('\r\n')
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

function openAdminPanel() {
  const experiment = selectedExperiment.value
  const config = experiment?.task_config ?? {}
  adminDraft.value = {
    experiment_id: experiment?.id ?? 'new-experiment',
    name: experiment?.name ?? '',
    system: experiment?.system_type ?? config.system ?? 'openEuler',
    image_name: experiment?.image_name ?? config.image_name ?? '',
    objective: config.objective ?? '',
    status: experiment?.status ?? 'active',
    schema_version: 2,
  }
  adminStepsText.value = JSON.stringify(config.steps ?? [], null, 2)
  adminContainerSpecText.value = JSON.stringify(config.container_spec ?? defaultContainerSpec(), null, 2)
  importText.value = ''
  importFile.value = null
  importWarnings.value = []
  importRawOutput.value = ''
  currentBuildId.value = ''
  buildStatus.value = ''
  buildLogs.value = ''
  buildError.value = ''
  buildDockerfile.value = ''
  clearBuildPolling()
  adminStatus.value = ''
  showAdmin.value = true
}

async function saveAdminExperiment() {
  if (!adminDraft.value) return
  adminStatus.value = '正在保存实验配置'
  try {
    const steps = JSON.parse(adminStepsText.value || '[]')
    const containerSpec = JSON.parse(adminContainerSpecText.value || '{}')
    const response = await fetch(`${apiBase}/api/admin/experiments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...adminDraft.value, steps, container_spec: containerSpec }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.detail || '保存失败')
    }
    const saved = await response.json()
    await loadExperiments()
    selectedExperimentId.value = saved.id
    openAdminPanel()
    adminStatus.value = '实验配置已保存'
    statusText.value = '实验配置已更新'
  } catch (error) {
    adminStatus.value = error instanceof Error ? error.message : '保存失败'
  }
}

async function buildAdminExperiment() {
  if (!adminDraft.value || isBuildRunning.value) return
  adminStatus.value = '正在启动镜像构建'
  buildLogs.value = ''
  buildError.value = ''
  buildDockerfile.value = ''
  try {
    const steps = JSON.parse(adminStepsText.value || '[]')
    const containerSpec = JSON.parse(adminContainerSpecText.value || '{}')
    const response = await fetch(`${apiBase}/api/admin/experiments/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...adminDraft.value, steps, container_spec: containerSpec }),
    })
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, '启动构建失败'))
    }
    const payload = await response.json()
    currentBuildId.value = payload.build_id ?? payload.id
    applyBuildState(payload)
    startBuildPolling()
  } catch (error) {
    adminStatus.value = error instanceof Error ? error.message : '启动构建失败'
  }
}

async function importAdminText() {
  if (!importText.value.trim()) return
  adminStatus.value = '正在识别文档步骤'
  try {
    const response = await fetch(`${apiBase}/api/admin/experiments/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: importText.value }),
    })
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, '导入失败'))
    }
    const payload = await response.json()
    applyImportedDraft(payload)
  } catch (error) {
    adminStatus.value = error instanceof Error ? error.message : '导入失败'
  }
}

function onImportFileChange(event) {
  const target = event.target
  importFile.value = target?.files?.[0] ?? null
  importWarnings.value = []
  importRawOutput.value = ''
}

async function importAdminFile() {
  if (!importFile.value) {
    adminStatus.value = '请先选择 Markdown 或 TXT 文件'
    return
  }
  adminStatus.value = '正在上传并识别文档'
  try {
    const form = new FormData()
    form.append('file', importFile.value)
    const response = await fetch(`${apiBase}/api/admin/experiments/import-file`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, '上传导入失败'))
    }
    const payload = await response.json()
    applyImportedDraft(payload)
  } catch (error) {
    adminStatus.value = error instanceof Error ? error.message : '上传导入失败'
  }
}

function applyImportedDraft(payload) {
  importWarnings.value = payload.warnings ?? []
  importRawOutput.value = payload.raw_output ?? ''
  if (payload.draft) {
    const { steps = [], container_spec: containerSpec = defaultContainerSpec(), ...draft } = payload.draft
    adminDraft.value = {
      status: 'active',
      schema_version: 2,
      ...draft,
    }
    adminStepsText.value = JSON.stringify(steps, null, 2)
    adminContainerSpecText.value = JSON.stringify(containerSpec, null, 2)
    currentBuildId.value = ''
    buildStatus.value = ''
    buildLogs.value = ''
    buildError.value = ''
    buildDockerfile.value = ''
    clearBuildPolling()
    adminStatus.value = payload.source === 'deepseek'
      ? 'AI 已生成实验草稿，请检查后构建镜像'
      : '已使用规则生成步骤草稿，请检查后构建镜像'
    return
  }
  if (payload.steps) {
    adminStepsText.value = JSON.stringify(payload.steps, null, 2)
  }
  adminStatus.value = importWarnings.value.length
    ? `AI 草稿格式需要修正：${importWarnings.value.join('；')}`
    : 'AI 草稿格式需要修正，请查看原始输出后调整'
}

async function responseErrorMessage(response, fallback) {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const payload = JSON.parse(text)
    if (payload.detail) return Array.isArray(payload.detail) ? payload.detail.join('；') : String(payload.detail)
    if (payload.warnings?.length) return payload.warnings.join('；')
    if (payload.error) return String(payload.error)
  } catch {
    return text
  }
  return text || fallback
}

function defaultContainerSpec() {
  return {
    base_image: 'openeuler/openeuler:22.03-lts-sp3',
    packages: [],
    pip_packages: [],
    npm_packages: [],
    student_dirs: [],
    student_files: [],
    sources: {
      openeuler_mirror: 'https://repo.huaweicloud.com/openeuler',
      pip_index_url: 'https://pypi.tuna.tsinghua.edu.cn/simple',
      npm_registry: 'https://registry.npmmirror.com',
    },
  }
}

function startBuildPolling() {
  clearBuildPolling()
  pollBuildStatus()
  buildPollTimer = window.setInterval(pollBuildStatus, 1000)
}

function clearBuildPolling() {
  if (buildPollTimer) {
    window.clearInterval(buildPollTimer)
    buildPollTimer = null
  }
}

async function pollBuildStatus() {
  if (!currentBuildId.value) return
  try {
    const response = await fetch(`${apiBase}/api/admin/experiments/builds/${currentBuildId.value}`)
    if (!response.ok) return
    const payload = await response.json()
    applyBuildState(payload)
    if (payload.status === 'succeeded' || payload.status === 'failed') {
      clearBuildPolling()
      if (payload.status === 'succeeded') {
        await loadExperiments()
        selectedExperimentId.value = payload.experiment_id
        adminStatus.value = '镜像构建成功，实验已自动发布'
      }
    }
  } catch {
    // 下一次轮询会继续尝试。
  }
}

function applyBuildState(payload) {
  currentBuildId.value = payload.build_id ?? payload.id ?? currentBuildId.value
  buildStatus.value = payload.status ?? ''
  buildLogs.value = payload.logs ?? ''
  buildError.value = payload.error ?? ''
  buildDockerfile.value = payload.dockerfile ?? ''
  if (payload.status === 'queued') adminStatus.value = '构建已排队'
  if (payload.status === 'running') adminStatus.value = '正在构建镜像'
  if (payload.status === 'failed') adminStatus.value = payload.error || '镜像构建失败'
}
</script>

<template>
  <main v-if="isTeacherRoute" class="teacher-shell">
    <header class="teacher-topbar">
      <div class="brand-block">
        <div class="brand-orbit">
          <FlaskConical :size="21" />
        </div>
        <div>
          <strong>教师实验管理</strong>
        </div>
      </div>

      <div class="experiment-switcher">
        <label for="teacher-experiment-select">当前实验</label>
        <select id="teacher-experiment-select" v-model="selectedExperimentId" @change="openAdminPanel">
          <option v-for="experiment in experiments" :key="experiment.id" :value="experiment.id">
            {{ experiment.name }}
          </option>
        </select>
      </div>

      <a class="admin-link" href="/">返回学生端</a>
    </header>

    <section class="teacher-admin-panel teacher-admin-page" v-if="adminDraft">
      <header>
        <strong>实验配置</strong>
        <span>{{ adminStatus || '上传 Markdown/TXT 或粘贴文本生成 v2 实验草稿，确认后保存发布。' }}</span>
      </header>

      <div class="teacher-admin-grid">
        <label>
          实验ID
          <input v-model="adminDraft.experiment_id" :disabled="isBuildRunning" />
        </label>
        <label>
          实验名称
          <input v-model="adminDraft.name" :disabled="isBuildRunning" />
        </label>
        <label>
          系统类型
          <input v-model="adminDraft.system" :disabled="isBuildRunning" />
        </label>
        <label>
          Docker镜像
          <input v-model="adminDraft.image_name" :disabled="isBuildRunning" />
        </label>
      </div>

      <label class="teacher-admin-block">
        实验目标
        <textarea v-model="adminDraft.objective" rows="2" :disabled="isBuildRunning"></textarea>
      </label>

      <div class="teacher-import-box">
        <label class="teacher-file-picker">
          上传实验文档
          <input type="file" accept=".md,.txt,text/markdown,text/plain" :disabled="isBuildRunning" @change="onImportFileChange" />
        </label>
        <button class="primary-button" :disabled="!importFile || isBuildRunning" @click="importAdminFile">
          <Upload :size="16" />
          AI 识别文档草稿
        </button>
        <span v-if="importFile">{{ importFile.name }}</span>
      </div>

      <div v-if="importWarnings.length" class="teacher-import-warnings">
        <span v-for="warning in importWarnings" :key="warning">{{ warning }}</span>
      </div>

      <details v-if="importRawOutput" class="teacher-raw-output">
        <summary>查看 AI 原始输出</summary>
        <pre>{{ importRawOutput }}</pre>
      </details>

      <div class="teacher-admin-columns">
        <label>
          Markdown/文本导入
          <textarea v-model="importText" rows="9" :disabled="isBuildRunning" placeholder="粘贴实验文档、步骤说明或 Markdown 代码块"></textarea>
          <button class="primary-button" :disabled="isBuildRunning" @click="importAdminText">识别文本草稿</button>
        </label>
        <label>
          容器需求 JSON
          <textarea v-model="adminContainerSpecText" rows="9" :disabled="isBuildRunning"></textarea>
          <span class="teacher-source-hint">默认使用华为云 openEuler、清华 pip、npmmirror npm 源。</span>
        </label>
      </div>

      <div class="teacher-admin-columns">
        <label>
          步骤 JSON
          <textarea v-model="adminStepsText" rows="12" :disabled="isBuildRunning"></textarea>
          <button class="primary-button" :disabled="isBuildRunning" @click="saveAdminExperiment">仅保存实验配置</button>
        </label>
        <div class="teacher-build-panel">
          <div class="teacher-build-actions">
            <button class="primary-button teacher-build-button" :disabled="isBuildRunning || !adminDraft.image_name" @click="buildAdminExperiment">
              {{ isBuildRunning ? '正在构建...' : '构建容器镜像并发布' }}
            </button>
            <span v-if="buildStatus" class="teacher-build-status" :class="buildStatus">{{ buildStatus }}</span>
          </div>
          <details v-if="buildDockerfile" open class="teacher-dockerfile-preview">
            <summary>Dockerfile 预览</summary>
            <pre>{{ buildDockerfile }}</pre>
          </details>
          <div v-if="buildLogs || buildError" class="teacher-build-log">
            <strong>{{ buildError ? '构建失败' : '构建日志' }}</strong>
            <pre>{{ buildLogs || buildError }}</pre>
          </div>
        </div>
      </div>
    </section>
  </main>

  <main v-else class="kk-shell">
    <header class="kk-topbar">
      <div class="brand-block">
        <div class="brand-orbit">
          <FlaskConical :size="21" />
        </div>
        <div>
          <strong>信创Linux AI实时陪练实训平台</strong>
        </div>
      </div>

      <div class="experiment-switcher">
        <label for="experiment-select">实验模块</label>
        <select id="experiment-select" :value="selectedExperimentId" :disabled="busy" @change="switchExperiment">
          <option v-for="experiment in experiments" :key="experiment.id" :value="experiment.id">
            {{ experiment.name }}
          </option>
        </select>
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
            <a
              v-if="activeSession?.terminal_url"
              class="terminal-open-link"
              :href="activeSession.terminal_url"
              target="_blank"
              rel="noreferrer"
              title="在新窗口打开终端"
            >
              <ExternalLink :size="15" />
              新窗口
            </a>
            <button class="stop-button" :disabled="!activeSession || busy" @click="stopSession" title="停止实验">
              <Square :size="13" />
              停止
            </button>
            <button title="重置实验" :disabled="!activeSession || busy" @click="resetSession">
              <RefreshCcw :size="16" />
            </button>
            <button title="生成报告" :disabled="!activeSession || busy" @click="generateReport">
              <FileText :size="16" />
            </button>
          </div>
        </header>

        <div class="terminal-body">
          <div v-if="hasTerminalFrame" class="terminal-iframe-wrap">
            <iframe
              :key="terminalFrameKey"
              class="terminal-frame"
              :src="activeSession.terminal_url"
              title="openEuler terminal"
              @load="onTerminalFrameLoad"
            />
            <div v-if="terminalFrameFailed" class="terminal-frame-fallback">
              <strong>终端还没有连上</strong>
              <span>{{ activeSession.terminal_url }}</span>
              <a :href="activeSession.terminal_url" target="_blank" rel="noreferrer">
                <ExternalLink :size="15" />
                在新窗口打开终端
              </a>
            </div>
          </div>

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
