import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { marked } from 'marked';
import Topbar from '@/components/Topbar';
import StepNav from '@/components/StepNav';
import TaskPanel from '@/components/TaskPanel';
import CoachPanel from '@/components/CoachPanel';
import TerminalPanel from '@/components/TerminalPanel';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Experiment, LabSession, StepProgress, AICoachRecord } from '@/types';

export default function StudentPage() {
  const api = useApi();
  const ws = useWebSocket();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('file-basic');
  const [studentId] = useState<string>('stu001');
  const [activeSession, setActiveSession] = useState<LabSession | null>(null);
  const [aiRecords, setAiRecords] = useState<AICoachRecord[]>([]);
  const [stepProgress, setStepProgress] = useState<StepProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [statusText, setStatusText] = useState('等待启动');
  const [remainingSeconds, setRemainingSeconds] = useState(60 * 60);
  const [analyzingCommand, setAnalyzingCommand] = useState('');
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
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
    return Math.round((confirmedStepIds.size / currentSteps.length) * 100);
  }, [currentSteps.length, confirmedStepIds]);

  const runtimeLabel = useMemo(() => {
    if (!activeSession) return '未启动';
    return activeSession.runtime_mode === 'docker' ? 'Docker 容器' : '模拟模式';
  }, [activeSession]);

  // Load experiments on mount
  useEffect(() => {
    api.loadExperiments().then((data) => {
      setExperiments(data);
      if (data.length && !data.find((item) => item.id === selectedExperimentId)) {
        setSelectedExperimentId(data[0].id);
      }
    });
  }, []);

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

  const clearSessionState = useCallback(() => {
    setActiveSession(null);
    setAiRecords([]);
    setStepProgress([]);
    setActiveStepId(null);
    setAnalyzingCommand('');
    setReportUrl('');
    ws.disconnect();
  }, [ws]);

  const stopActiveSession = useCallback(async () => {
    if (!activeSession) return;
    await api.stopSession(activeSession.id);
    clearSessionState();
  }, [activeSession, api, clearSessionState]);

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

  const loadProgress = useCallback(async () => {
    if (!activeSession) return;
    try {
      const payload = await api.loadStepProgress(activeSession.id);
      setStepProgress(payload.progress ?? []);
    } catch {
      // silent fail
    }
  }, [activeSession, api]);

  const connectCoachSocket = useCallback(
    (sessionId: string) => {
      ws.connect(sessionId, {
        onAIPending: (command) => setAnalyzingCommand(command),
        onAICoach: (record) => {
          setAnalyzingCommand('');
          setAiRecords((prev) => [...prev, record]);
        },
        onStepCompleted: () => loadProgress(),
      });
    },
    [ws, loadProgress]
  );

  const startSession = useCallback(async () => {
    setBusy(true);
    setStatusText('正在启动实验环境');
    setReportUrl('');
    try {
      const session = await api.createSession(studentId, selectedExperimentId);
      setActiveSession(session);
      setAiRecords([]);
      setStepProgress([]);
      setActiveStepId(null);
      setAnalyzingCommand('');
      setRemainingSeconds(60 * 60);
      connectCoachSocket(session.id);
      const payload = await api.loadStepProgress(session.id);
      setStepProgress(payload.progress ?? []);
      setStatusText(session.runtime_mode === 'docker' ? '实验环境已就绪' : '模拟模式');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '实验启动失败');
    } finally {
      setBusy(false);
    }
  }, [api, studentId, selectedExperimentId, connectCoachSocket]);

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
      const session = await api.resetSession(activeSession.id);
      setActiveSession(session);
      setAiRecords([]);
      setStepProgress([]);
      setActiveStepId(null);
      setAnalyzingCommand('');
      connectCoachSocket(session.id);
      const payload = await api.loadStepProgress(session.id);
      setStepProgress(payload.progress ?? []);
      setStatusText(session.runtime_mode === 'docker' ? '实验环境已重置' : '模拟模式');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '重置失败');
      clearSessionState();
    } finally {
      setBusy(false);
    }
  }, [activeSession, api, connectCoachSocket, clearSessionState]);

  const sendMockCommand = useCallback(
    async (cmd: string) => {
      if (!activeSession || !cmd.trim()) return;
      setBusy(true);
      try {
        const payload = await api.sendMockCommand(activeSession.id, cmd.trim());
        if (payload.log?.clean_content) {
          // Output is handled by xterm in TerminalPanel
        }
        await loadProgress();
      } finally {
        setBusy(false);
      }
    },
    [activeSession, api, loadProgress]
  );

  const confirmStep = useCallback(
    async (stepId: number) => {
      if (!activeSession) return;
      try {
        const payload = await api.confirmStep(activeSession.id, stepId);
        setStepProgress(payload.progress ?? stepProgress);
        setActiveStepId(null);
      } catch {
        // silent fail
      }
    },
    [activeSession, api, stepProgress]
  );

  const generateReport = useCallback(async () => {
    if (!activeSession) return;
    try {
      const payload = await api.generateReport(activeSession.id);
      setReportUrl(payload.url);
      window.open(payload.url, '_blank');
    } catch {
      // silent fail
    }
  }, [activeSession, api]);

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

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <Topbar
        experiments={experiments}
        selectedExperimentId={selectedExperimentId}
        onSelectExperiment={switchExperiment}
        activeSession={activeSession}
        remainingSeconds={remainingSeconds}
        onStartSession={startSession}
        busy={busy}
      />

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(360px,40%)_minmax(560px,60%)] gap-4 p-4">
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
          onSendMockCommand={sendMockCommand}
          busy={busy}
        />
      </main>
    </div>
  );
}
