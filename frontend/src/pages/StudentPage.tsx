import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { marked } from 'marked';
import { Loader2, LogIn, ClipboardList, Bot, Terminal } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';
import Topbar from '@/components/Topbar';
import StepNav from '@/components/StepNav';
import TaskPanel from '@/components/TaskPanel';
import CoachPanel from '@/components/CoachPanel';
import TerminalPanel from '@/components/TerminalPanel';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Experiment, LabSession, StepProgress, AICoachRecord, AIStreamChunk, ExperimentCompletedPayload } from '@/types';

const sessionStorageKey = (studentId: string) => `linux-ai-active-session:${studentId}`;
const experimentStorageKey = (studentId: string) => `linux-ai-active-experiment:${studentId}`;
const STUDENT_LOGIN_STORAGE_KEY = 'linux-ai-student-id';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredSessionId(studentId: string): string {
  return getLocalStorage()?.getItem(sessionStorageKey(studentId)) ?? '';
}

function readStoredExperimentId(studentId: string): string {
  return getLocalStorage()?.getItem(experimentStorageKey(studentId)) ?? '';
}

function readStoredStudentId(): string {
  return getLocalStorage()?.getItem(STUDENT_LOGIN_STORAGE_KEY) ?? '';
}

function persistStoredStudentId(studentId: string): void {
  getLocalStorage()?.setItem(STUDENT_LOGIN_STORAGE_KEY, studentId);
}

function clearStoredStudentId(): void {
  getLocalStorage()?.removeItem(STUDENT_LOGIN_STORAGE_KEY);
}

function persistStoredSession(session: LabSession): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(sessionStorageKey(session.student_id), session.id);
  storage.setItem(experimentStorageKey(session.student_id), session.experiment_id);
}

function clearStoredSession(studentId: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(sessionStorageKey(studentId));
  storage.removeItem(experimentStorageKey(studentId));
}

function remainingSecondsForSession(session: LabSession): number {
  const startedAt = Date.parse(session.start_time ?? '');
  if (!Number.isFinite(startedAt)) return 60 * 60;
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, 60 * 60 - elapsedSeconds);
}

function aiRecordKey(record: AICoachRecord): string {
  return String(record.id || `${record.created_at}-${record.command}`);
}

function mergeAiRecordsById(existing: AICoachRecord[], incoming: AICoachRecord[]): AICoachRecord[] {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter((record) => {
    const key = aiRecordKey(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function StudentPage() {
  const {
    loadExperiments,
    loginStudent,
    createSession,
    getSession,
    getCurrentSession,
    stopSession: stopSessionApi,
    resetSession: resetSessionApi,
    loadStepProgress,
    confirmStep: confirmStepApi,
    sendMockCommand: sendMockCommandApi,
    generateReport: generateReportApi,
    getLogs,
  } = useApi();
  const { connect: connectCoach, disconnect: disconnectCoach } = useWebSocket();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('file-basic');
  const [studentId, setStudentId] = useState<string>(() => readStoredStudentId());
  const [studentLoginInput, setStudentLoginInput] = useState<string>(() => readStoredStudentId());
  const [loginError, setLoginError] = useState('');
  const [activeSession, setActiveSession] = useState<LabSession | null>(null);
  const [aiRecords, setAiRecords] = useState<AICoachRecord[]>([]);
  const [stepProgress, setStepProgress] = useState<StepProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [statusText, setStatusText] = useState('等待启动');
  const [remainingSeconds, setRemainingSeconds] = useState(60 * 60);
  const [analyzingCommand, setAnalyzingCommand] = useState('');
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [streamingRecord, setStreamingRecord] = useState<AICoachRecord | null>(null);
  const [experimentCompleted, setExperimentCompleted] = useState(false);
  const [mobileTab, setMobileTab] = useState<'task' | 'coach' | 'terminal'>('task');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedExperiment = useMemo(
    () => experiments.find((item) => item.id === selectedExperimentId),
    [experiments, selectedExperimentId]
  );

  const currentSteps = useMemo(() => selectedExperiment?.task_config?.steps ?? [], [selectedExperiment]);

  const stepProgressMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of stepProgress) {
      map.set(p.step_id, p.status);
    }
    return map;
  }, [stepProgress]);

  const confirmedStepIds = useMemo(() => {
    const confirmed = new Set<number>();
    for (const p of stepProgress) {
      if (p.status === 'confirmed') {
        confirmed.add(p.step_id);
      }
    }
    return confirmed;
  }, [stepProgress]);

  const progressedStepCount = useMemo(
    () => stepProgress.filter((p) => p.status === 'completed' || p.status === 'confirmed').length,
    [stepProgress]
  );

  const currentQuestion = useMemo(() => {
    const nextStep = currentSteps.find((step) => {
      const status = stepProgressMap.get(step.id);
      return status !== 'confirmed';
    });
    return nextStep?.id ?? currentSteps.length ?? 1;
  }, [currentSteps, stepProgressMap]);

  const displayedStepId = activeStepId ?? currentQuestion;

  const displayedStep = useMemo(
    () => currentSteps.find((step) => step.id === displayedStepId) ?? currentSteps[0],
    [currentSteps, displayedStepId]
  );

  const displayedStepStatus = useMemo(() => {
    if (!displayedStep) return 'locked';
    return stepProgressMap.get(displayedStep.id) ?? 'locked';
  }, [displayedStep, stepProgressMap]);

  const progressPercent = useMemo(() => {
    if (!currentSteps.length) return 0;
    return Math.round((progressedStepCount / currentSteps.length) * 100);
  }, [currentSteps.length, progressedStepCount]);

  const runtimeLabel = useMemo(() => {
    if (!activeSession) return '未启动';
    return activeSession.runtime_mode === 'docker' ? 'Docker 容器' : '模拟模式';
  }, [activeSession]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (activeSession && prev > 0) return prev - 1;
        return prev;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession]);

  const clearSessionState = useCallback((options?: { clearStored?: boolean }) => {
    setActiveSession(null);
    setAiRecords([]);
    setStepProgress([]);
    setActiveStepId(null);
    setAnalyzingCommand('');
    setReportUrl('');
    if (options?.clearStored !== false) {
      clearStoredSession(studentId);
    }
    disconnectCoach();
  }, [disconnectCoach, studentId]);

  const stopActiveSession = useCallback(async () => {
    if (!activeSession) return;
    await stopSessionApi(activeSession.id);
    clearSessionState();
  }, [activeSession, clearSessionState, stopSessionApi]);

  const switchExperiment = useCallback(
    async (nextExperimentId: string) => {
      if (!nextExperimentId || nextExperimentId === selectedExperimentId || busy) return;
      const previousExperimentId = selectedExperimentId;
      setBusy(true);
      setStatusText('正在切换实验模块');
      try {
        if (activeSession) {
          await stopActiveSession();
        } else {
          clearSessionState();
        }
        setSelectedExperimentId(nextExperimentId);
        setStatusText('已切换实验模块');
      } catch (error) {
        setSelectedExperimentId(previousExperimentId);
        setStatusText(error instanceof Error ? error.message : '切换实验失败');
      } finally {
        setBusy(false);
      }
    },
    [selectedExperimentId, busy, activeSession, stopActiveSession, clearSessionState]
  );

  const loadProgressForSession = useCallback(async (sessionId: string) => {
    try {
      const payload = await loadStepProgress(sessionId);
      setStepProgress(payload.progress ?? []);
    } catch {
      // silent fail
    }
  }, [loadStepProgress]);

  const loadLogsForSession = useCallback(async (sessionId: string) => {
    try {
      const payload = await getLogs(sessionId);
      setAiRecords((prev) => mergeAiRecordsById(prev, payload.ai_records ?? []));
    } catch {
      // silent fail
    }
  }, [getLogs]);

  const connectCoachSocket = useCallback(
    (sessionId: string) => {
      connectCoach(sessionId, {
        onAIPending: (command) => setAnalyzingCommand(command),
        onAIStream: (chunk: AIStreamChunk) => {
          setAnalyzingCommand('');
          setStreamingRecord((prev) => {
            if (prev) {
              return { ...prev, ai_response: prev.ai_response + chunk.chunk };
            }
            return {
              id: `streaming-${Date.now()}`,
              command: chunk.command,
              ai_response: chunk.chunk,
              created_at: new Date().toISOString(),
            };
          });
        },
        onAICoach: (record) => {
          setAnalyzingCommand('');
          setStreamingRecord(null);
          setAiRecords((prev) => mergeAiRecordsById(prev, [record]));
        },
        onStepCompleted: () => loadProgressForSession(sessionId),
        onExperimentCompleted: (payload: ExperimentCompletedPayload) => {
          setExperimentCompleted(true);
          setStatusText('实验已完成');
          setRemainingSeconds(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          // Refresh session to get updated end_time
          void getSession(payload.session_id).then((session) => {
            if (session) setActiveSession(session);
          });
        },
      });
    },
    [connectCoach, loadProgressForSession, getSession]
  );

  const submitStudentLogin = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextStudentId = studentLoginInput.trim();
    if (!nextStudentId) {
      setLoginError('请输入学号');
      return;
    }
    setBusy(true);
    setLoginError('');
    setStatusText('正在校验学号');
    try {
      const student = await loginStudent(nextStudentId);
      persistStoredStudentId(student.student_id);
      setStudentId(student.student_id);
      setStudentLoginInput(student.student_id);
      setStatusText('学号校验通过');
    } catch (error) {
      clearStoredStudentId();
      setLoginError(error instanceof Error ? error.message : '学号未登记');
      setStatusText('学号校验失败');
    } finally {
      setBusy(false);
    }
  }, [loginStudent, studentLoginInput]);

  const logoutStudent = useCallback(async () => {
    setBusy(true);
    try {
      if (activeSession) {
        await stopSessionApi(activeSession.id);
      }
    } catch {
      // keep logout usable even if the container was already gone
    } finally {
      clearSessionState();
      clearStoredStudentId();
      setStudentId('');
      setStudentLoginInput('');
      setExperiments([]);
      setStatusText('已退出登录');
      setBusy(false);
    }
  }, [activeSession, clearSessionState, stopSessionApi]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!studentId) {
        setExperiments([]);
        setStatusText('请先填写学号');
        return;
      }
      try {
        await loginStudent(studentId);
        if (cancelled) return;
        const data = await loadExperiments();
        if (cancelled) return;
        setExperiments(data);

        const storedExperimentId = readStoredExperimentId(studentId);
        const defaultExperimentId = data.some((item) => item.id === 'file-basic')
          ? 'file-basic'
          : data[0]?.id ?? 'file-basic';
        if (storedExperimentId && data.some((item) => item.id === storedExperimentId)) {
          setSelectedExperimentId(storedExperimentId);
        } else if (data.length) {
          setSelectedExperimentId(defaultExperimentId);
        }

        let session: LabSession | null = null;
        const storedSessionId = readStoredSessionId(studentId);
        if (storedSessionId) {
          try {
            session = await getSession(storedSessionId);
          } catch {
            clearStoredSession(studentId);
          }
        }
        if (session) {
          const isKnownExperiment = data.some((item) => item.id === session!.experiment_id);
          if (session.status !== 'running' || !isKnownExperiment) {
            session = null;
          }
        }
        if (!session && storedExperimentId) {
          session = await getCurrentSession(studentId, storedExperimentId).catch(() => null);
        }
        if (!session) {
          session = await getCurrentSession(studentId).catch(() => null);
        }
        if (cancelled || !session) {
          clearStoredSession(studentId);
          return;
        }

        persistStoredSession(session);
        setSelectedExperimentId(session.experiment_id);
        setActiveSession(session);
        setActiveStepId(null);
        setAnalyzingCommand('');
        setReportUrl('');
        setRemainingSeconds(remainingSecondsForSession(session));
        connectCoachSocket(session.id);
        await Promise.all([loadProgressForSession(session.id), loadLogsForSession(session.id)]);
        if (!cancelled) {
          setStatusText(session.runtime_mode === 'docker' ? '实验环境已恢复' : '模拟模式已恢复');
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof Error && error.message.includes('学号')) {
            clearStoredStudentId();
            setStudentId('');
            setLoginError(error.message);
          }
          setStatusText(error instanceof Error ? error.message : '实验列表加载失败');
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [
    connectCoachSocket,
    getCurrentSession,
    getSession,
    loginStudent,
    loadExperiments,
    loadLogsForSession,
    loadProgressForSession,
    studentId,
  ]);

  useEffect(() => {
    if (!activeSession) return;
    const syncSessionState = () => {
      void loadProgressForSession(activeSession.id);
      void loadLogsForSession(activeSession.id);
    };
    syncSessionState();
    const timer = window.setInterval(syncSessionState, 3000);
    return () => window.clearInterval(timer);
  }, [activeSession, loadLogsForSession, loadProgressForSession]);

  const startSession = useCallback(async () => {
    setBusy(true);
    setStatusText('正在启动实验环境');
    setReportUrl('');
    try {
      const session = await createSession(studentId, selectedExperimentId);
      persistStoredSession(session);
      setSelectedExperimentId(session.experiment_id);
      setActiveSession(session);
      setAiRecords([]);
      setStepProgress([]);
      setActiveStepId(null);
      setAnalyzingCommand('');
      setRemainingSeconds(60 * 60);
      connectCoachSocket(session.id);
      await loadProgressForSession(session.id);
      setStatusText(session.runtime_mode === 'docker' ? '实验环境已就绪' : '模拟模式');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '实验启动失败');
    } finally {
      setBusy(false);
    }
  }, [connectCoachSocket, createSession, loadProgressForSession, selectedExperimentId, studentId]);

  const stopSession = useCallback(async () => {
    if (!activeSession) return;
    setBusy(true);
    setStatusText('正在停止实验环境');
    try {
      await stopActiveSession();
      setStatusText('实验已停止');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '停止实验失败');
    } finally {
      setBusy(false);
    }
  }, [activeSession, stopActiveSession]);

  const resetSession = useCallback(async () => {
    if (!activeSession) return;
    setBusy(true);
    setStatusText('正在重置实验环境');
    try {
      const session = await resetSessionApi(activeSession.id);
      persistStoredSession(session);
      setSelectedExperimentId(session.experiment_id);
      setActiveSession(session);
      setAiRecords([]);
      setStepProgress([]);
      setActiveStepId(null);
      setAnalyzingCommand('');
      connectCoachSocket(session.id);
      setRemainingSeconds(remainingSecondsForSession(session));
      await loadProgressForSession(session.id);
      setStatusText(session.runtime_mode === 'docker' ? '实验环境已重置' : '模拟模式');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '重置失败');
      clearSessionState();
    } finally {
      setBusy(false);
    }
  }, [activeSession, clearSessionState, connectCoachSocket, loadProgressForSession, resetSessionApi]);

  const sendMockCommand = useCallback(
    async (cmd: string) => {
      if (!activeSession || !cmd.trim()) return;
      setBusy(true);
      try {
        const payload = await sendMockCommandApi(activeSession.id, cmd.trim());
        if (payload.log?.clean_content) {
          // Output is handled by xterm in TerminalPanel
        }
        await loadProgressForSession(activeSession.id);
      } finally {
        setBusy(false);
      }
    },
    [activeSession, loadProgressForSession, sendMockCommandApi]
  );

  const confirmStep = useCallback(
    async (stepId: number) => {
      if (!activeSession) return;
      try {
        const payload = await confirmStepApi(activeSession.id, stepId);
        setStepProgress(payload.progress ?? stepProgress);
        setActiveStepId(null);
      } catch {
        // silent fail
      }
    },
    [activeSession, confirmStepApi, stepProgress]
  );

  const generateReport = useCallback(async () => {
    if (!activeSession) return;
    try {
      const payload = await generateReportApi(activeSession.id);
      setReportUrl(payload.url);
      window.open(payload.url, '_blank');
    } catch {
      // silent fail
    }
  }, [activeSession, generateReportApi]);

  const exportDocx = useCallback(async () => {
    if (!activeSession) return;
    setBusy(true);
    try {
      const payload = await generateReportApi(activeSession.id);
      if (payload.docx_url) {
        window.location.href = payload.docx_url;
      }
    } catch {
      // silent fail
    } finally {
      setBusy(false);
    }
  }, [activeSession, generateReportApi]);

  const selectStep = useCallback(
    (stepId: number) => {
      const status = stepProgressMap.get(stepId);
      if (status === 'locked' || !status) return;
      setActiveStepId(stepId === currentQuestion ? null : stepId);
    },
    [stepProgressMap, currentQuestion]
  );

  const renderMarkdown = useCallback((text: string) => {
    if (!text) return '';
    return marked.parse(text, { breaks: true, gfm: true });
  }, []);

  if (!studentId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-brand-100/40 to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-brand-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 -left-20 w-60 h-60 bg-accent-200/15 rounded-full blur-3xl pointer-events-none" />
        
        <header className="h-14 flex items-center justify-between gap-4 px-6 bg-white/80 backdrop-blur-sm border-b border-slate-200/80 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <LogoIcon variant="dark" size={32} />
            <strong className="text-dark text-sm font-semibold whitespace-nowrap tracking-tight">
              信创Linux AI实时陪练实训平台
            </strong>
          </div>
        </header>
        <main className="flex-1 grid place-items-center px-4 py-8 relative z-10">
          <form
            onSubmit={submitStudentLogin}
            className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50"
          >
            <div className="w-12 h-12 grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25 mb-4">
              <LogIn size={20} />
            </div>
            <strong className="block text-lg font-bold text-dark tracking-tight">学生登录</strong>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              请输入教师端已录入的学号，通过校验后即可进入实验平台。
            </p>
            <label className="mt-6 block">
              <span className="mb-1.5 block text-xs font-bold text-dark">学号</span>
              <input
                value={studentLoginInput}
                onChange={(event) => setStudentLoginInput(event.target.value)}
                disabled={busy}
                autoFocus
                className="h-11 w-full rounded-xl border-0 bg-slate-50 px-4 text-sm text-dark outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 placeholder:text-slate-400"
                placeholder="例如：2026001"
              />
            </label>
            {loginError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-0 bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 hover:from-brand-600 hover:to-brand-700 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 transition-all"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              {busy ? '正在校验' : '进入实验平台'}
            </button>
          </form>
        </main>
      </div>
    );
  }

  const tabConfig = [
    { key: 'task' as const, label: '任务', icon: ClipboardList },
    { key: 'coach' as const, label: 'AI陪练', icon: Bot },
    { key: 'terminal' as const, label: '终端', icon: Terminal },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <Topbar
        experiments={experiments}
        selectedExperimentId={selectedExperimentId}
        onSelectExperiment={switchExperiment}
        activeSession={activeSession}
        remainingSeconds={remainingSeconds}
        onStartSession={startSession}
        studentId={studentId}
        onLogout={logoutStudent}
        busy={busy}
      />

      {/* Desktop layout */}
      <main className="flex-1 min-h-0 hidden lg:grid grid-cols-1 lg:grid-cols-[minmax(360px,40%)_minmax(560px,60%)] gap-4 p-4">
        <aside className="min-w-0 min-h-0 grid grid-rows-[1fr_1fr] gap-4">
          <TaskPanel
            currentSteps={currentSteps}
            stepProgressMap={stepProgressMap}
            currentQuestion={currentQuestion}
            displayedStep={displayedStep}
            displayedStepStatus={displayedStepStatus}
            progressPercent={progressPercent}
            onSelectStep={selectStep}
            onConfirmStep={confirmStep}
            renderMarkdown={renderMarkdown}
          />
          <CoachPanel
            aiRecords={aiRecords}
            analyzingCommand={analyzingCommand}
            statusText={statusText}
            renderMarkdown={renderMarkdown}
            streamingRecord={streamingRecord}
            experimentCompleted={experimentCompleted}
          />
        </aside>

        <TerminalPanel
          activeSession={activeSession}
          selectedExperimentName={selectedExperiment?.name}
          runtimeLabel={runtimeLabel}
          hasTerminalFrame={Boolean(activeSession?.terminal_url)}
          onStartSession={startSession}
          onStopSession={stopSession}
          onResetSession={resetSession}
          onGenerateReport={generateReport}
          onExportDocx={exportDocx}
          onSendMockCommand={sendMockCommand}
          busy={busy}
        />
      </main>

      {/* Mobile layout with bottom tabs */}
      <main className="flex-1 min-h-0 flex flex-col lg:hidden">
        <div className="flex-1 min-h-0 flex flex-col p-3 pb-0">
          {mobileTab === 'task' && (
            <TaskPanel
              currentSteps={currentSteps}
              stepProgressMap={stepProgressMap}
              currentQuestion={currentQuestion}
              displayedStep={displayedStep}
              displayedStepStatus={displayedStepStatus}
              progressPercent={progressPercent}
              onSelectStep={selectStep}
              onConfirmStep={confirmStep}
              renderMarkdown={renderMarkdown}
            />
          )}
          {mobileTab === 'coach' && (
            <CoachPanel
              aiRecords={aiRecords}
              analyzingCommand={analyzingCommand}
              statusText={statusText}
              renderMarkdown={renderMarkdown}
              streamingRecord={streamingRecord}
              experimentCompleted={experimentCompleted}
            />
          )}
          {mobileTab === 'terminal' && (
            <TerminalPanel
              activeSession={activeSession}
              selectedExperimentName={selectedExperiment?.name}
              runtimeLabel={runtimeLabel}
              hasTerminalFrame={Boolean(activeSession?.terminal_url)}
              onStartSession={startSession}
              onStopSession={stopSession}
              onResetSession={resetSession}
              onGenerateReport={generateReport}
              onExportDocx={exportDocx}
              onSendMockCommand={sendMockCommand}
              busy={busy}
            />
          )}
        </div>

        {/* Bottom Tab Bar */}
        <nav className="shrink-0 flex items-center justify-around bg-white border-t border-slate-200/80 px-2 safe-area-pb">
          {tabConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = mobileTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setMobileTab(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 min-w-[64px] transition-colors ${
                  isActive
                    ? 'text-brand-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[11px] font-semibold ${isActive ? 'text-brand-600' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
