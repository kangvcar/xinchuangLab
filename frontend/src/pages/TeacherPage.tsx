import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Save,
  Send,
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
  const [studentRosterStatus, setStudentRosterStatus] = useState('');
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBuildRunning = buildStatus === 'queued' || buildStatus === 'running';
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
    setAdminStatus('正在识别文档步骤');
    try {
      const payload = await api.importText(importText);
      applyImportedDraft(payload);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '导入失败');
    }
  }, [importText, api, applyImportedDraft]);

  const importAdminFile = useCallback(async () => {
    if (!importFile) {
      setAdminStatus('请先选择 Markdown 或 TXT 文件');
      return;
    }
    setAdminStatus('正在上传并识别文档');
    try {
      const payload = await api.importFile(importFile);
      applyImportedDraft(payload);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '上传导入失败');
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
    <div className="min-h-screen flex flex-col bg-white">
      <header className="h-14 flex items-center gap-4 px-6 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2.5 min-w-[140px]">
          <div className="w-8 h-8 grid place-items-center rounded-md text-white bg-neutral-900">
            <FlaskConical size={18} />
          </div>
          <strong className="text-neutral-900 text-sm font-semibold">教师实验管理</strong>
        </div>

        {adminDraft && (
          <span className={`h-6 inline-flex items-center rounded-md border px-2 text-xs font-medium ${statusBadgeClass(adminDraft.status)}`}>
            {statusLabel(adminDraft.status)}
          </span>
        )}

        {isDirty && <span className="text-xs font-medium text-amber-700">有未保存修改</span>}

        <Link
          to="/"
          className="ml-auto h-8 inline-flex items-center px-3 rounded-md font-medium text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors no-underline"
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
          <div className="max-w-6xl mx-auto mb-4 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Users size={16} className="text-neutral-700" />
                <strong className="text-sm font-semibold text-neutral-900">学生准入</strong>
                <span className="text-xs font-medium text-neutral-500">{students.length} 个学号</span>
                {studentRosterStatus && (
                  <span className="truncate text-xs font-medium text-neutral-500">{studentRosterStatus}</span>
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
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 sm:w-36"
                />
                <input
                  value={studentNameInput}
                  onChange={(event) => setStudentNameInput(event.target.value)}
                  placeholder="姓名，可选"
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 sm:w-36"
                />
                <button
                  type="submit"
                  className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-900 bg-neutral-900 px-3 text-xs font-medium text-white transition-colors hover:bg-neutral-800 active:bg-neutral-950"
                >
                  <UserPlus size={13} />
                  录入
                </button>
              </form>
            </div>
            {students.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {students.map((student) => (
                  <span
                    key={student.student_id}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-700"
                  >
                    <span className="font-mono text-neutral-900">{student.student_id}</span>
                    {student.name && <span>{student.name}</span>}
                    <button
                      type="button"
                      onClick={() => void removeStudent(student.student_id)}
                      title="删除学生"
                      className="grid h-5 w-5 place-items-center rounded text-neutral-500 hover:bg-white hover:text-red-700"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {adminDraft ? (
            <div className="max-w-6xl mx-auto bg-white border border-neutral-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-5">
                <strong className="text-neutral-900 text-base font-semibold">实验配置</strong>
                <span className="text-neutral-500 text-sm">
                  {adminStatus || '上传 Markdown/TXT 或粘贴文本生成 v2 实验草稿，确认后保存发布。'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验ID</Field.Label>
                  <input
                    value={adminDraft.experiment_id}
                    onChange={(e) => updateDraft('experiment_id', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验名称</Field.Label>
                  <input
                    value={adminDraft.name}
                    onChange={(e) => updateDraft('name', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">系统类型</Field.Label>
                  <input
                    value={adminDraft.system}
                    onChange={(e) => updateDraft('system', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">Docker镜像</Field.Label>
                  <input
                    value={adminDraft.image_name}
                    onChange={(e) => updateDraft('image_name', e.target.value)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验状态</Field.Label>
                  <select
                    value={adminDraft.status}
                    onChange={(e) => updateDraft('status', e.target.value as ExperimentStatus)}
                    disabled={isBuildRunning}
                    className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                  </select>
                </Field.Root>
              </div>

              <Field.Root className="mb-3">
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验目标</Field.Label>
                <textarea
                  value={adminDraft.objective}
                  onChange={(e) => updateDraft('objective', e.target.value)}
                  rows={2}
                  disabled={isBuildRunning}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
                />
              </Field.Root>

              <Separator className="my-4 bg-neutral-200" />

              <div className="flex flex-wrap items-end gap-3 mb-3 p-3 border border-neutral-200 rounded-lg bg-neutral-50">
                <div className="min-w-[200px]">
                  <label className="text-neutral-900 text-xs font-semibold block mb-1.5">上传实验文档</label>
                  <input
                    type="file"
                    accept=".md,.txt,text/markdown,text/plain"
                    disabled={isBuildRunning}
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] ?? null);
                      setImportWarnings([]);
                      setImportRawOutput('');
                    }}
                    className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:text-neutral-900 file:font-medium file:text-xs hover:file:bg-neutral-50 disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={importAdminFile}
                  disabled={!importFile || isBuildRunning}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Upload size={14} />
                  AI 识别文档草稿
                </button>
                {importFile && <span className="text-neutral-500 text-xs font-medium">{importFile.name}</span>}
              </div>

              {importWarnings.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {importWarnings.map((warning, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-md text-red-700 bg-red-50 text-xs font-medium">
                      <AlertTriangle size={13} />
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {importRawOutput && (
                <details className="mb-3 border border-neutral-200 rounded-lg bg-white overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer font-semibold text-xs text-neutral-900 hover:bg-neutral-50">
                    查看 AI 原始输出
                  </summary>
                  <pre className="max-h-[260px] m-0 p-3 overflow-auto border-t border-neutral-200 whitespace-pre-wrap font-mono text-xs text-neutral-700 bg-neutral-50">
                    {importRawOutput}
                  </pre>
                </details>
              )}

              <ValidationSummary errors={validationErrors} warnings={validationWarnings} />

              <Tabs.Root defaultValue="text" className="mt-4">
                <Tabs.List className="flex gap-1 mb-4 border-b border-neutral-200">
                  {[
                    { value: 'text', label: '导入文档' },
                    { value: 'steps', label: '步骤流程' },
                    { value: 'advanced', label: '高级配置' },
                    { value: 'build', label: '保存发布' },
                  ].map((tab) => (
                    <Tabs.Tab
                      key={tab.value}
                      value={tab.value}
                      className="h-8 px-3 text-xs font-medium text-neutral-500 border-b-2 border-transparent -mb-px data-[active=true]:text-neutral-900 data-[active=true]:border-neutral-900 hover:text-neutral-700 focus:outline-none transition-colors"
                    >
                      {tab.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>

                <Tabs.Panel value="text" className="space-y-3">
                  <Field.Root>
                    <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">
                      Markdown/文本导入
                    </Field.Label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={9}
                      disabled={isBuildRunning}
                      placeholder="粘贴实验文档、步骤说明或 Markdown 代码块"
                      className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
                    />
                  </Field.Root>
                  <button
                    onClick={importAdminText}
                    disabled={isBuildRunning}
                    className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    识别文本草稿
                  </button>
                </Tabs.Panel>

                <Tabs.Panel value="steps" className="space-y-3">
                  <StepFlowEditor
                    stepsText={adminStepsText}
                    disabled={isBuildRunning}
                    onStepsTextChange={setAdminStepsText}
                    onValidationError={handleStepEditorValidation}
                  />
                  <button
                    onClick={saveAdminExperiment}
                    disabled={isBuildRunning}
                    className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save size={13} />
                    保存实验配置
                  </button>
                </Tabs.Panel>

                <Tabs.Panel value="advanced" className="space-y-4">
                  <Field.Root>
                    <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">
                      容器需求 JSON
                    </Field.Label>
                    <textarea
                      value={adminContainerSpecText}
                      onChange={(e) => setAdminContainerSpecText(e.target.value)}
                      rows={10}
                      disabled={isBuildRunning}
                      className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
                    />
                  </Field.Root>
                  <span className="block text-neutral-500 text-xs font-medium">
                    默认使用华为云 openEuler、清华 pip、npmmirror npm 源。
                  </span>
                  <Field.Root>
                    <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">
                      步骤 JSON
                    </Field.Label>
                    <textarea
                      value={adminStepsText}
                      onChange={(e) => setAdminStepsText(e.target.value)}
                      rows={16}
                      disabled={isBuildRunning}
                      className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
                    />
                  </Field.Root>
                  <button
                    onClick={saveAdminExperiment}
                    disabled={isBuildRunning}
                    className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                      className="h-9 inline-flex items-center gap-1.5 px-4 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save size={14} />
                      保存草稿
                    </button>
                    <button
                      onClick={buildAdminExperiment}
                      disabled={isBuildRunning || !adminDraft.image_name}
                      className="h-9 inline-flex items-center gap-1.5 px-4 rounded-md font-medium text-xs text-white bg-neutral-900 border border-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                        className={`h-6 inline-flex items-center gap-1 px-2.5 rounded-md text-xs font-medium border
                          ${buildStatus === 'succeeded'
                            ? 'text-green-700 border-green-200 bg-green-50'
                            : buildStatus === 'failed'
                            ? 'text-red-700 border-red-200 bg-red-50'
                            : 'text-neutral-600 border-neutral-200 bg-neutral-50'}
                        `}
                      >
                        {buildStatus === 'succeeded' && <CheckCircle2 size={11} />}
                        {buildStatus === 'failed' && <XCircle size={11} />}
                        {buildStatus}
                      </span>
                    )}
                  </div>

                  {buildDockerfile && (
                    <details open className="border border-neutral-200 rounded-lg bg-white overflow-hidden">
                      <summary className="px-3 py-2 cursor-pointer font-semibold text-xs text-neutral-900 hover:bg-neutral-50">
                        Dockerfile 预览
                      </summary>
                      <pre className="max-h-[300px] m-0 p-3 overflow-auto border-t border-neutral-200 whitespace-pre-wrap font-mono text-xs text-neutral-700 bg-neutral-50">
                        {buildDockerfile}
                      </pre>
                    </details>
                  )}

                  {(buildLogs || buildError) && (
                    <div className="border border-neutral-200 rounded-lg bg-white overflow-hidden">
                      <strong className="block px-3 py-2 text-neutral-900 font-semibold text-xs border-b border-neutral-200">
                        {buildError ? (
                          <span className="flex items-center gap-1.5 text-red-700">
                            <XCircle size={13} />
                            构建失败
                          </span>
                        ) : (
                          '构建日志'
                        )}
                      </strong>
                      <pre className="max-h-[300px] m-0 p-3 overflow-auto whitespace-pre-wrap font-mono text-xs text-neutral-700 bg-neutral-50">
                        {buildLogs || buildError}
                      </pre>
                    </div>
                  )}
                </Tabs.Panel>
              </Tabs.Root>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto border border-neutral-200 rounded-lg bg-white p-8 text-center">
              <strong className="text-neutral-900 text-base font-semibold">暂无实验配置</strong>
              <p className="mt-2 text-sm text-neutral-500">可以从左侧新建一个实验草稿。</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
