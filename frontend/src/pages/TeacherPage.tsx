import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FileText,
  FlaskConical,
  Loader2,
  ListChecks,
  Rocket,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { Tabs } from '@base-ui/react/tabs';
import { Separator } from '@base-ui/react/separator';
import { Field } from '@base-ui/react/field';
import ExperimentSidebar from '@/components/teacher/ExperimentSidebar';
import StepFlowEditor from '@/components/teacher/StepFlowEditor';
import ValidationSummary from '@/components/teacher/ValidationSummary';
import { useApi } from '@/hooks/useApi';
import type { BuildState, ContainerSpec, Experiment, ExperimentStatus, ImportPayload, Step, StudentRecord } from '@/types';
import {
  buildSavePayload,
  createBlankSnapshot,
  createCopySnapshot,
  createSnapshotFromExperiment,
  defaultContainerSpec,
  editorSnapshotKey,
  normalizeExperimentStatus,
  sortExperiments,
  statusBadgeClass,
  statusLabel,
  validateSnapshot,
  type AdminDraft,
  type ExperimentSortMode,
  type EditorSnapshot,
  type StatusFilter,
} from './teacherExperimentDraft';

const EDITOR_TABS = [
  { value: 'text', label: '导入文档', description: '上传或粘贴实验材料', icon: FileText },
  { value: 'steps', label: '步骤流程', description: '整理任务和验证规则', icon: ListChecks },
  { value: 'advanced', label: '高级配置', description: '容器与原始 JSON', icon: SlidersHorizontal },
  { value: 'build', label: '保存发布', description: '保存草稿或构建发布', icon: Rocket },
] as const;

export default function TeacherPage() {
  const api = useApi();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('file-basic');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<ExperimentSortMode>('manual');
  const [adminDraft, setAdminDraft] = useState<AdminDraft | null>(null);
  const [adminStepsText, setAdminStepsText] = useState('');
  const [adminContainerSpecText, setAdminContainerSpecText] = useState('');
  const [savedSnapshotKey, setSavedSnapshotKey] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importRawOutput, setImportRawOutput] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [currentBuildId, setCurrentBuildId] = useState('');
  const [buildStatus, setBuildStatus] = useState('');
  const [buildLogs, setBuildLogs] = useState('');
  const [buildError, setBuildError] = useState('');
  const [buildDockerfile, setBuildDockerfile] = useState('');
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [studentInput, setStudentInput] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentImportFile, setStudentImportFile] = useState<File | null>(null);
  const [isStudentImporting, setIsStudentImporting] = useState(false);
  const [studentRosterStatus, setStudentRosterStatus] = useState('');
  const [isImportingDraft, setIsImportingDraft] = useState(false);
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBuildRunning = buildStatus === 'queued' || buildStatus === 'running';
  const isEditorBusy = isBuildRunning || isImportingDraft;
  const selectedExperiment = experiments.find((item) => item.id === selectedExperimentId);
  const currentSnapshot: EditorSnapshot | null = adminDraft
    ? { draft: adminDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText }
    : null;
  const isDirty = Boolean(currentSnapshot && savedSnapshotKey && editorSnapshotKey(currentSnapshot) !== savedSnapshotKey);

  const clearBuildPolling = useCallback(() => {
    if (buildPollTimerRef.current) {
      clearInterval(buildPollTimerRef.current);
      buildPollTimerRef.current = null;
    }
  }, []);

  const resetBuildState = useCallback(() => {
    setCurrentBuildId('');
    setBuildStatus('');
    setBuildLogs('');
    setBuildError('');
    setBuildDockerfile('');
  }, []);

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setAdminDraft(snapshot.draft);
    setAdminStepsText(snapshot.stepsText);
    setAdminContainerSpecText(snapshot.containerSpecText);
    setSavedSnapshotKey(editorSnapshotKey(snapshot));
    setValidationErrors([]);
    setValidationWarnings([]);
  }, []);

  const refreshAdminExperiments = useCallback(async (preferredId?: string) => {
    const data = await api.loadAdminExperiments();
    setExperiments(data);
    const preferredExists = Boolean(preferredId && data.find((item) => item.id === preferredId));
    const nextSelectedId = preferredExists ? preferredId : selectedExperimentId;
    if (data.length && !data.find((item) => item.id === nextSelectedId)) {
      setSelectedExperimentId(data[0].id);
    } else if (preferredExists && preferredId) {
      setSelectedExperimentId(preferredId);
    }
    return data;
  }, [api, selectedExperimentId]);

  const refreshStudents = useCallback(async () => {
    const data = await api.loadStudents();
    setStudents(data);
    return data;
  }, [api]);

  const confirmDiscardDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('当前实验有未保存修改，切换后这些修改会丢失。确认继续？');
  }, [isDirty]);

  const applyBuildState = useCallback((payload: BuildState) => {
    setCurrentBuildId(String(payload.build_id ?? payload.id ?? ''));
    setBuildStatus(String(payload.status ?? ''));
    setBuildLogs(String(payload.logs ?? ''));
    setBuildError(String(payload.error ?? ''));
    setBuildDockerfile(String(payload.dockerfile ?? ''));
    const status = String(payload.status ?? '');
    if (status === 'queued') setAdminStatus('构建已排队');
    if (status === 'running') setAdminStatus('正在构建镜像');
    if (status === 'failed') setAdminStatus(String(payload.error || '镜像构建失败'));
  }, []);

  const startBuildPolling = useCallback((buildId = currentBuildId) => {
    clearBuildPolling();
    const poll = async () => {
      if (!buildId) return;
      try {
        const payload = await api.getBuildStatus(buildId);
        applyBuildState(payload);
        if (payload.status === 'succeeded' || payload.status === 'failed') {
          clearBuildPolling();
          if (payload.status === 'succeeded') {
            const data = await refreshAdminExperiments(payload.experiment_id);
            const refreshed = data.find((item) => item.id === payload.experiment_id);
            if (refreshed) applySnapshot(createSnapshotFromExperiment(refreshed));
            setSelectedExperimentId(payload.experiment_id);
            setAdminStatus('镜像构建成功，实验已自动发布');
          }
        }
      } catch {
        // silent fail, next poll will retry
      }
    };
    poll();
    buildPollTimerRef.current = setInterval(poll, 1000);
  }, [api, applyBuildState, applySnapshot, clearBuildPolling, currentBuildId, refreshAdminExperiments]);

  const openAdminPanel = useCallback(() => {
    if (selectedExperiment) {
      applySnapshot(createSnapshotFromExperiment(selectedExperiment));
    }
    setImportText('');
    setImportFile(null);
    setImportWarnings([]);
    setImportRawOutput('');
    resetBuildState();
    clearBuildPolling();
    setAdminStatus('');
  }, [applySnapshot, clearBuildPolling, resetBuildState, selectedExperiment]);

  useEffect(() => {
    api.loadAdminExperiments()
      .then((data) => {
        setExperiments(data);
        if (data.length && !data.find((item) => item.id === selectedExperimentId)) {
          setSelectedExperimentId(data[0].id);
        }
        if (!data.length) {
          const snapshot = createBlankSnapshot(new Set());
          applySnapshot(snapshot);
          setSelectedExperimentId(snapshot.draft.experiment_id);
        }
      })
      .catch((error) => setAdminStatus(error instanceof Error ? error.message : '读取实验列表失败'));
    refreshStudents().catch((error) => setStudentRosterStatus(error instanceof Error ? error.message : '读取学生名单失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (adminDraft?.experiment_id === selectedExperiment.id && savedSnapshotKey) return;
    openAdminPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExperiment, selectedExperimentId]);

  useEffect(() => {
    return () => clearBuildPolling();
  }, [clearBuildPolling]);

  const applyImportedDraft = useCallback((payload: ImportPayload) => {
    setImportWarnings((payload.warnings as string[]) ?? []);
    setImportRawOutput(String(payload.raw_output ?? ''));
    if (payload.draft) {
      const {
        steps = [],
        container_spec: containerSpec = defaultContainerSpec(),
        ...draft
      } = payload.draft as Record<string, unknown> & { steps?: Step[]; container_spec?: ContainerSpec };
      applySnapshot({
        draft: {
          experiment_id: String(draft.experiment_id ?? draft.id ?? 'imported-experiment'),
          name: String(draft.name ?? '导入实验草稿'),
          system: String(draft.system ?? 'openEuler'),
          image_name: String(draft.image_name ?? ''),
          objective: String(draft.objective ?? ''),
          status: normalizeExperimentStatus(String(draft.status ?? 'draft')),
          schema_version: Number(draft.schema_version ?? 2),
          sort_order: draft.sort_order === undefined ? undefined : Number(draft.sort_order),
        },
        stepsText: JSON.stringify(steps, null, 2),
        containerSpecText: JSON.stringify(containerSpec, null, 2),
      });
      resetBuildState();
      clearBuildPolling();
      setAdminStatus(
        payload.source === 'deepseek'
          ? 'AI 已生成实验草稿，请检查后构建镜像'
          : '已使用规则生成步骤草稿，请检查后构建镜像'
      );
      return;
    }
    if (payload.steps) {
      setAdminStepsText(JSON.stringify(payload.steps, null, 2));
    }
    const warnings = (payload.warnings as string[]) ?? [];
    setAdminStatus(
      warnings.length
        ? `AI 草稿格式需要修正：${warnings.join('；')}`
        : 'AI 草稿格式需要修正，请查看原始输出后调整'
    );
  }, [applySnapshot, clearBuildPolling, resetBuildState]);

  const selectExperiment = useCallback((experimentId: string) => {
    if (experimentId === selectedExperimentId) return;
    if (!confirmDiscardDirty()) return;
    setSelectedExperimentId(experimentId);
  }, [confirmDiscardDirty, selectedExperimentId]);

  const createBlankExperiment = useCallback(() => {
    if (!confirmDiscardDirty()) return;
    const snapshot = createBlankSnapshot(new Set(experiments.map((item) => item.id)));
    applySnapshot(snapshot);
    setSelectedExperimentId(snapshot.draft.experiment_id);
    setAdminStatus('已创建草稿，请完善后保存');
    resetBuildState();
  }, [applySnapshot, confirmDiscardDirty, experiments, resetBuildState]);

  const copySelectedExperiment = useCallback(() => {
    if (!selectedExperiment || !confirmDiscardDirty()) return;
    const snapshot = createCopySnapshot(selectedExperiment, new Set(experiments.map((item) => item.id)));
    applySnapshot(snapshot);
    setSelectedExperimentId(snapshot.draft.experiment_id);
    setAdminStatus('已复制为草稿，请检查后保存');
    resetBuildState();
  }, [applySnapshot, confirmDiscardDirty, experiments, resetBuildState, selectedExperiment]);

  const deactivateSelectedExperiment = useCallback(async () => {
    if (!selectedExperiment || isBuildRunning) return;
    const confirmed = window.confirm(`删除实验“${selectedExperiment.name}”？历史会话和报告会保留，学生端将不再显示该实验。`);
    if (!confirmed) return;
    setAdminStatus('正在删除实验');
    try {
      await api.deleteExperiment(selectedExperiment.id);
      await refreshAdminExperiments();
      setAdminStatus('实验已删除');
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '删除实验失败');
    }
  }, [api, isBuildRunning, refreshAdminExperiments, selectedExperiment]);

  const moveExperimentOrder = useCallback(async (experimentId: string, direction: -1 | 1) => {
    const ordered = sortExperiments(
      experiments.filter((item) => normalizeExperimentStatus(item.status) !== 'inactive'),
      'manual'
    );
    const currentIndex = ordered.findIndex((item) => item.id === experimentId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    setSortMode('manual');
    setExperiments(next);
    setAdminStatus('正在保存实验顺序');
    try {
      await api.reorderExperiments(next.map((item) => item.id));
      await refreshAdminExperiments(experimentId);
      setAdminStatus('实验顺序已同步到学生端');
    } catch (error) {
      await refreshAdminExperiments();
      setAdminStatus(error instanceof Error ? error.message : '保存实验顺序失败');
    }
  }, [api, experiments, refreshAdminExperiments]);

  const saveAdminExperiment = useCallback(async () => {
    if (!adminDraft) return;
    const snapshot: EditorSnapshot = { draft: adminDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText };
    const validation = validateSnapshot(snapshot, 'save');
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);
    if (validation.errors.length) {
      setAdminStatus('请先修正实验配置');
      return;
    }
    setAdminStatus('正在保存实验配置');
    try {
      const saved = await api.saveExperiment(buildSavePayload(snapshot));
      await refreshAdminExperiments(saved.id);
      applySnapshot(createSnapshotFromExperiment(saved));
      setSelectedExperimentId(saved.id);
      setAdminStatus('实验配置已保存');
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '保存失败');
    }
  }, [adminContainerSpecText, adminDraft, adminStepsText, api, applySnapshot, refreshAdminExperiments]);

  const buildAdminExperiment = useCallback(async () => {
    if (!adminDraft || isBuildRunning) return;
    const publishDraft: AdminDraft = { ...adminDraft, status: 'published' };
    const snapshot: EditorSnapshot = { draft: publishDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText };
    const validation = validateSnapshot(snapshot, 'publish');
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);
    if (validation.errors.length) {
      setAdminStatus('请先修正发布配置');
      return;
    }
    setAdminStatus('正在启动镜像构建');
    setBuildLogs('');
    setBuildError('');
    setBuildDockerfile('');
    try {
      setAdminDraft(publishDraft);
      const payload = await api.buildExperiment(buildSavePayload(snapshot));
      const buildId = payload.build_id ?? payload.id ?? '';
      setCurrentBuildId(buildId);
      applyBuildState(payload);
      setTimeout(() => startBuildPolling(buildId), 100);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '启动构建失败');
    }
  }, [
    adminContainerSpecText,
    adminDraft,
    adminStepsText,
    api,
    applyBuildState,
    isBuildRunning,
    startBuildPolling,
  ]);

  const importAdminText = useCallback(async () => {
    if (!importText.trim()) return;
    setAdminStatus('DeepSeek 正在分析文档步骤');
    setIsImportingDraft(true);
    try {
      const payload = await api.importText(importText);
      applyImportedDraft(payload);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '导入失败');
    } finally {
      setIsImportingDraft(false);
    }
  }, [importText, api, applyImportedDraft]);

  const importAdminFile = useCallback(async () => {
    if (!importFile) {
      setAdminStatus('请先选择 Markdown 或 TXT 文件');
      return;
    }
    setAdminStatus('DeepSeek 正在分析上传文档');
    setIsImportingDraft(true);
    try {
      const payload = await api.importFile(importFile);
      applyImportedDraft(payload);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '上传导入失败');
    } finally {
      setIsImportingDraft(false);
    }
  }, [importFile, api, applyImportedDraft]);

  const addStudent = useCallback(async () => {
    const studentId = studentInput.trim();
    if (!studentId) {
      setStudentRosterStatus('请先填写学号');
      return;
    }
    setStudentRosterStatus('正在保存学生');
    try {
      await api.saveStudent(studentId, studentNameInput);
      setStudentInput('');
      setStudentNameInput('');
      await refreshStudents();
      setStudentRosterStatus('学生学号已录入');
    } catch (error) {
      setStudentRosterStatus(error instanceof Error ? error.message : '保存学生失败');
    }
  }, [api, refreshStudents, studentInput, studentNameInput]);

  const removeStudent = useCallback(async (studentId: string) => {
    const confirmed = window.confirm(`删除学生学号“${studentId}”？该学生之后将无法登录实验平台。`);
    if (!confirmed) return;
    setStudentRosterStatus('正在删除学生');
    try {
      await api.deleteStudent(studentId);
      await refreshStudents();
      setStudentRosterStatus('学生已移除');
    } catch (error) {
      setStudentRosterStatus(error instanceof Error ? error.message : '删除学生失败');
    }
  }, [api, refreshStudents]);

  const importStudentRoster = useCallback(async () => {
    if (!studentImportFile) {
      setStudentRosterStatus('请先选择 TXT 学生名单');
      return;
    }
    setIsStudentImporting(true);
    setStudentRosterStatus('正在批量导入学生');
    try {
      const payload = await api.importStudentsFile(studentImportFile);
      setStudentImportFile(null);
      await refreshStudents();
      const warningText = payload.warnings.length ? `，${payload.warnings.length} 条需检查` : '';
      const skippedText = payload.skipped ? `，跳过 ${payload.skipped} 行` : '';
      setStudentRosterStatus(`批量导入完成：新增 ${payload.created} 人，更新 ${payload.updated} 人${skippedText}${warningText}`);
    } catch (error) {
      setStudentRosterStatus(error instanceof Error ? error.message : '批量导入学生失败');
    } finally {
      setIsStudentImporting(false);
    }
  }, [api, refreshStudents, studentImportFile]);

  const updateDraft = useCallback((field: keyof AdminDraft, value: AdminDraft[keyof AdminDraft]) => {
    setAdminDraft((prev) => (prev ? ({ ...prev, [field]: value } as AdminDraft) : prev));
  }, []);

  const handleStepEditorValidation = useCallback((message: string) => {
    setValidationErrors((prev) => {
      const withoutStepParseErrors = prev.filter((item) => !(
        item.startsWith('步骤 JSON 格式错误：') || item.includes('verification JSON 格式错误')
      ));
      if (!message) {
        return withoutStepParseErrors.length === prev.length ? prev : withoutStepParseErrors;
      }
      return [message, ...withoutStepParseErrors];
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="h-14 flex items-center gap-4 px-6 bg-white/80 backdrop-blur-sm border-b border-slate-200/80 shadow-sm shadow-slate-100/50">
        <div className="flex items-center gap-2.5 min-w-[140px]">
          <div className="w-8 h-8 grid place-items-center rounded-lg text-white bg-gradient-to-br from-brand-500 to-brand-600 shadow-sm shadow-brand-500/20">
            <FlaskConical size={18} />
          </div>
          <strong className="text-dark text-sm font-bold tracking-tight">教师实验管理</strong>
        </div>

        {adminDraft && (
          <span className={`h-6 inline-flex items-center rounded-lg border px-2.5 text-xs font-semibold ${statusBadgeClass(adminDraft.status)} shadow-sm`}>
            {statusLabel(adminDraft.status)}
          </span>
        )}

        {isDirty && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            有未保存修改
          </span>
        )}

        <Link
          to="/lab"
          className="ml-auto h-8 inline-flex items-center px-3 rounded-lg font-semibold text-xs border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-dark hover:border-slate-300 active:bg-slate-100 transition-all no-underline shadow-sm"
        >
          返回学生端
        </Link>
      </header>

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <ExperimentSidebar
          experiments={experiments}
          selectedExperimentId={selectedExperimentId}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortMode={sortMode}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onSortModeChange={setSortMode}
          onSelect={selectExperiment}
          onCreateBlank={createBlankExperiment}
          onCopySelected={copySelectedExperiment}
          onDeactivateSelected={deactivateSelectedExperiment}
          onMoveExperiment={moveExperimentOrder}
          canCopySelected={Boolean(selectedExperiment)}
          canDeactivateSelected={Boolean(selectedExperiment && normalizeExperimentStatus(selectedExperiment.status) !== 'inactive')}
          disabled={isBuildRunning}
        />

        <section className="flex-1 min-w-0 overflow-auto p-6">
          <div className="max-w-6xl mx-auto mb-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-7 h-7 grid place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Users size={14} />
                </span>
                <strong className="text-sm font-bold text-dark">学生准入</strong>
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{students.length} 个学号</span>
                {studentRosterStatus && (
                  <span className="truncate text-xs font-semibold text-slate-400">{studentRosterStatus}</span>
                )}
              </div>
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addStudent();
                }}
              >
                <input
                  value={studentInput}
                  onChange={(event) => setStudentInput(event.target.value)}
                  placeholder="学号"
                  className="h-9 w-full rounded-xl border-0 bg-slate-50 px-3 text-sm text-dark outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white sm:w-36 placeholder:text-slate-400"
                />
                <input
                  value={studentNameInput}
                  onChange={(event) => setStudentNameInput(event.target.value)}
                  placeholder="姓名，可选"
                  className="h-9 w-full rounded-xl border-0 bg-slate-50 px-3 text-sm text-dark outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white sm:w-36 placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border-0 bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:from-brand-600 hover:to-brand-700 hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-px active:translate-y-0 transition-all"
                >
                  <UserPlus size={13} />
                  录入
                </button>
              </form>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-bold text-dark">批量导入学生 TXT</span>
                <span className="text-xs text-slate-400">每行：学号,姓名。重复学号会更新姓名并恢复准入。</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept=".txt,text/plain"
                  disabled={isStudentImporting}
                  onChange={(event) => setStudentImportFile(event.target.files?.[0] ?? null)}
                  className="w-full text-xs file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-dark hover:file:bg-slate-50 disabled:opacity-50 sm:w-56"
                />
                <button
                  type="button"
                  onClick={importStudentRoster}
                  disabled={!studentImportFile || isStudentImporting}
                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-dark transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                >
                  {isStudentImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  批量导入
                </button>
              </div>
            </div>
            {students.length > 0 && (
              <div className="mt-4 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                {students.map((student) => (
                  <span
                    key={student.student_id}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 shadow-sm"
                  >
                    <span className="font-mono text-dark font-bold">{student.student_id}</span>
                    {student.name && <span className="text-slate-500">{student.name}</span>}
                    <button
                      type="button"
                      onClick={() => void removeStudent(student.student_id)}
                      title="删除学生"
                      className="grid h-5 w-5 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {adminDraft ? (
            <div className="max-w-6xl mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm shadow-slate-200/40">
              <div className="flex items-center gap-3 mb-5">
                <strong className="text-dark text-base font-bold">实验配置</strong>
                <span className="text-slate-400 text-sm">
                  {adminStatus || '上传 Markdown/TXT 或粘贴文本生成 v2 实验草稿，确认后保存发布。'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
                <Field.Root>
                  <Field.Label className="text-dark text-xs font-bold mb-1.5 block">实验ID</Field.Label>
                  <input
                    value={adminDraft.experiment_id}
                    onChange={(e) => updateDraft('experiment_id', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 placeholder:text-slate-400"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-dark text-xs font-bold mb-1.5 block">实验名称</Field.Label>
                  <input
                    value={adminDraft.name}
                    onChange={(e) => updateDraft('name', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 placeholder:text-slate-400"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-dark text-xs font-bold mb-1.5 block">系统类型</Field.Label>
                  <input
                    value={adminDraft.system}
                    onChange={(e) => updateDraft('system', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 placeholder:text-slate-400"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-dark text-xs font-bold mb-1.5 block">Docker镜像</Field.Label>
                  <input
                    value={adminDraft.image_name}
                    onChange={(e) => updateDraft('image_name', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 placeholder:text-slate-400"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-dark text-xs font-bold mb-1.5 block">实验状态</Field.Label>
                  <select
                    value={adminDraft.status}
                    onChange={(e) => updateDraft('status', e.target.value as ExperimentStatus)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                  </select>
                </Field.Root>
              </div>

              <Field.Root className="mb-3">
                <Field.Label className="text-dark text-xs font-bold mb-1.5 block">实验目标</Field.Label>
                <textarea
                  value={adminDraft.objective}
                  onChange={(e) => updateDraft('objective', e.target.value)}
                  rows={2}
                  disabled={isBuildRunning}
                  className="w-full px-3 py-2 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 resize-y placeholder:text-slate-400"
                />
              </Field.Root>

              <Separator className="my-4 bg-slate-200/80" />

              <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 hover:border-brand-300 hover:bg-brand-50/30 transition-all">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/20">
                      <Upload size={18} />
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm font-bold text-dark">上传实验文档</strong>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                        支持 Markdown/TXT，上传后可由 DeepSeek 识别为可编辑的实验草稿。
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label
                      className={`h-9 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-dark transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm shadow-sm ${isEditorBusy ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <FileText size={13} className="text-brand-500" />
                      选择文件
                      <input
                        type="file"
                        accept=".md,.txt,text/markdown,text/plain"
                        disabled={isEditorBusy}
                        onChange={(e) => {
                          setImportFile(e.target.files?.[0] ?? null);
                          setImportWarnings([]);
                          setImportRawOutput('');
                        }}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={importAdminFile}
                      disabled={!importFile || isEditorBusy}
                      className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-dark transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                    >
                      {isImportingDraft ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {isImportingDraft ? 'DeepSeek 分析中' : 'AI 识别文档草稿'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-400 shadow-sm">
                  {importFile ? (
                    <span className="inline-flex min-w-0 items-center gap-2 text-dark">
                      <FileText size={13} className="shrink-0 text-brand-500" />
                      <span className="truncate">{importFile.name}</span>
                    </span>
                  ) : (
                    '尚未选择文件'
                  )}
                </div>
              </div>

              {isImportingDraft && (
                <div className="mb-4 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50/80 to-white p-4 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 via-transparent to-brand-500/5 animate-pulse" />
                  <div className="relative flex items-center gap-2 text-sm font-bold text-dark">
                    <Loader2 size={15} className="animate-spin text-brand-500" />
                    DeepSeek 正在分析中
                  </div>
                  <div className="relative mt-1 text-xs text-slate-500">正在提取实验目标、步骤流程和验证规则，完成后会自动填入草稿。</div>
                  <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white shadow-inner">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-brand-400 to-brand-500" />
                  </div>
                </div>
              )}

              {importWarnings.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {importWarnings.map((warning, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-xl text-red-700 bg-red-50 text-xs font-semibold shadow-sm">
                      <AlertTriangle size={13} />
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {importRawOutput && (
                <details className="mb-4 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                  <summary className="px-3 py-2 cursor-pointer font-bold text-xs text-dark hover:bg-slate-50 transition-colors">
                    查看 AI 原始输出
                  </summary>
                  <pre className="max-h-[260px] m-0 p-3 overflow-auto border-t border-slate-200 whitespace-pre-wrap font-mono text-xs text-slate-600 bg-slate-50">
                    {importRawOutput}
                  </pre>
                </details>
              )}

              <ValidationSummary errors={validationErrors} warnings={validationWarnings} />

              <Tabs.Root defaultValue="text" className="mt-4">
                <Tabs.List className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                  {EDITOR_TABS.map((tab, index) => {
                    const Icon = tab.icon;
                    return (
                    <Tabs.Tab
                      key={tab.value}
                      value={tab.value}
                      className="min-h-16 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm data-[active=true]:border-brand-400 data-[active=true]:bg-brand-50/60 data-[active=true]:shadow-md data-[active=true]:shadow-brand-100/30 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-dark">
                        <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-brand-500 to-brand-600 text-[11px] text-white shadow-sm shadow-brand-500/20">{index + 1}</span>
                        <Icon size={14} className="text-brand-500" />
                        {tab.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-400">{tab.description}</span>
                    </Tabs.Tab>
                    );
                  })}
                </Tabs.List>

                <Tabs.Panel value="text" className="space-y-3">
                  <Field.Root>
                    <Field.Label className="text-dark text-xs font-bold mb-1.5 block">
                      Markdown/文本导入
                    </Field.Label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={9}
                      disabled={isEditorBusy}
                      placeholder="粘贴实验文档、步骤说明或 Markdown 代码块"
                      className="w-full px-3 py-2 rounded-xl border-0 bg-slate-50 text-dark text-sm font-mono leading-relaxed outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 resize-y placeholder:text-slate-400"
                    />
                  </Field.Root>
                  <button
                    onClick={importAdminText}
                    disabled={isEditorBusy || !importText.trim()}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl font-semibold text-xs text-dark bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {isImportingDraft ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-brand-500" />
                        DeepSeek 分析中
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} className="text-brand-500" />
                        识别文本草稿
                      </>
                    )}
                  </button>
                </Tabs.Panel>

                <Tabs.Panel value="steps" className="space-y-3">
                  <StepFlowEditor
                    stepsText={adminStepsText}
                    disabled={isEditorBusy}
                    onStepsTextChange={setAdminStepsText}
                    onValidationError={handleStepEditorValidation}
                  />
                  <button
                    onClick={saveAdminExperiment}
                    disabled={isEditorBusy}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl font-semibold text-xs text-dark bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <Save size={13} />
                    保存实验配置
                  </button>
                </Tabs.Panel>

                <Tabs.Panel value="advanced" className="space-y-4">
                  <Field.Root>
                    <Field.Label className="text-dark text-xs font-bold mb-1.5 block">
                      容器需求 JSON
                    </Field.Label>
                    <textarea
                      value={adminContainerSpecText}
                      onChange={(e) => setAdminContainerSpecText(e.target.value)}
                      rows={10}
                      disabled={isEditorBusy}
                      className="w-full px-3 py-2 rounded-xl border-0 bg-slate-50 text-dark text-sm font-mono leading-relaxed outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 resize-y placeholder:text-slate-400"
                    />
                  </Field.Root>
                  <span className="block text-slate-400 text-xs font-semibold">
                    默认使用华为云 openEuler、清华 pip、npmmirror npm 源。
                  </span>
                  <Field.Root>
                    <Field.Label className="text-dark text-xs font-bold mb-1.5 block">
                      步骤 JSON
                    </Field.Label>
                    <textarea
                      value={adminStepsText}
                      onChange={(e) => setAdminStepsText(e.target.value)}
                      rows={16}
                      disabled={isEditorBusy}
                      className="w-full px-3 py-2 rounded-xl border-0 bg-slate-50 text-dark text-sm font-mono leading-relaxed outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 resize-y placeholder:text-slate-400"
                    />
                  </Field.Root>
                  <button
                    onClick={saveAdminExperiment}
                    disabled={isEditorBusy}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl font-semibold text-xs text-dark bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <Save size={13} />
                    保存实验配置
                  </button>
                </Tabs.Panel>

                <Tabs.Panel value="build" className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={saveAdminExperiment}
                      disabled={isBuildRunning}
                      className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl font-semibold text-xs text-dark bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      <Save size={14} />
                      保存草稿
                    </button>
                    <button
                      onClick={buildAdminExperiment}
                      disabled={isBuildRunning || !adminDraft.image_name}
                      className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-brand-500 to-brand-600 border border-transparent hover:from-brand-600 hover:to-brand-700 hover:shadow-lg hover:shadow-brand-500/25 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all shadow-md shadow-brand-500/20"
                    >
                      {isBuildRunning ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          正在构建...
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          构建镜像并发布
                        </>
                      )}
                    </button>
                    {buildStatus && (
                      <span
                        className={`h-6 inline-flex items-center gap-1 px-2.5 rounded-lg text-xs font-semibold border shadow-sm
                          ${buildStatus === 'succeeded'
                            ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                            : buildStatus === 'failed'
                            ? 'text-red-700 border-red-200 bg-red-50'
                            : 'text-slate-600 border-slate-200 bg-slate-50'}
                        `}
                      >
                        {buildStatus === 'succeeded' && <CheckCircle2 size={11} className="text-emerald-500" />}
                        {buildStatus === 'failed' && <XCircle size={11} className="text-red-500" />}
                        {buildStatus}
                      </span>
                    )}
                  </div>

                  {buildDockerfile && (
                    <details open className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                      <summary className="px-4 py-2.5 cursor-pointer font-bold text-xs text-dark hover:bg-slate-50 transition-colors">
                        Dockerfile 预览
                      </summary>
                      <pre className="max-h-[300px] m-0 p-4 overflow-auto border-t border-slate-200 whitespace-pre-wrap font-mono text-xs text-slate-600 bg-slate-50">
                        {buildDockerfile}
                      </pre>
                    </details>
                  )}

                  {(buildLogs || buildError) && (
                    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                      <strong className="block px-4 py-2.5 text-dark font-bold text-xs border-b border-slate-200">
                        {buildError ? (
                          <span className="flex items-center gap-1.5 text-red-700">
                            <XCircle size={13} />
                            构建失败
                          </span>
                        ) : (
                          '构建日志'
                        )}
                      </strong>
                      <pre className="max-h-[300px] m-0 p-4 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-600 bg-slate-50">
                        {buildLogs || buildError}
                      </pre>
                    </div>
                  )}
                </Tabs.Panel>
              </Tabs.Root>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto border border-slate-200/80 rounded-2xl bg-white p-8 text-center shadow-sm">
              <div className="w-12 h-12 mx-auto grid place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 text-brand-500 mb-4">
                <FilePlus2 size={24} />
              </div>
              <strong className="text-dark text-base font-bold">暂无实验配置</strong>
              <p className="mt-2 text-sm text-slate-400">可以从左侧新建一个实验草稿。</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
