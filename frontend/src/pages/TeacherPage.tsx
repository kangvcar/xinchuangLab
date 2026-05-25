import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Upload, Loader2, CheckCircle2, XCircle, FileCode, AlertTriangle } from 'lucide-react';
import { Tabs } from '@base-ui/react/tabs';
import { Separator } from '@base-ui/react/separator';
import { Field } from '@base-ui/react/field';
import { useApi } from '@/hooks/useApi';
import type { Experiment, Step, ContainerSpec, TaskConfig, BuildState, ImportPayload } from '@/types';

function defaultContainerSpec(): ContainerSpec {
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
  };
}

export default function TeacherPage() {
  const api = useApi();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('file-basic');
  const [adminDraft, setAdminDraft] = useState<Record<string, unknown> | null>(null);
  const [adminStepsText, setAdminStepsText] = useState('');
  const [adminContainerSpecText, setAdminContainerSpecText] = useState('');
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
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBuildRunning = buildStatus === 'queued' || buildStatus === 'running';

  const selectedExperiment = experiments.find((item) => item.id === selectedExperimentId);

  useEffect(() => {
    api.loadExperiments().then((data) => {
      setExperiments(data);
      if (data.length && !data.find((item) => item.id === selectedExperimentId)) {
        setSelectedExperimentId(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedExperiment && !adminDraft) {
      openAdminPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExperiment]);

  const clearBuildPolling = useCallback(() => {
    if (buildPollTimerRef.current) {
      clearInterval(buildPollTimerRef.current);
      buildPollTimerRef.current = null;
    }
  }, []);

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

  const startBuildPolling = useCallback(() => {
    clearBuildPolling();
    const poll = async () => {
      if (!currentBuildId) return;
      try {
        const payload = await api.getBuildStatus(currentBuildId);
        applyBuildState(payload);
        if (payload.status === 'succeeded' || payload.status === 'failed') {
          clearBuildPolling();
          if (payload.status === 'succeeded') {
            const data = await api.loadExperiments();
            setExperiments(data);
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
  }, [currentBuildId, api, applyBuildState, clearBuildPolling]);

  const openAdminPanel = useCallback(() => {
    const experiment = selectedExperiment;
    const config: TaskConfig = experiment?.task_config ?? { steps: [] };
    setAdminDraft({
      experiment_id: experiment?.id ?? 'new-experiment',
      name: experiment?.name ?? '',
      system: experiment?.system_type ?? config.system ?? 'openEuler',
      image_name: experiment?.image_name ?? config.image_name ?? '',
      objective: config.objective ?? '',
      status: experiment?.status ?? 'active',
      schema_version: 2,
    });
    setAdminStepsText(JSON.stringify(config.steps ?? [], null, 2));
    setAdminContainerSpecText(JSON.stringify(config.container_spec ?? defaultContainerSpec(), null, 2));
    setImportText('');
    setImportFile(null);
    setImportWarnings([]);
    setImportRawOutput('');
    setCurrentBuildId('');
    setBuildStatus('');
    setBuildLogs('');
    setBuildError('');
    setBuildDockerfile('');
    clearBuildPolling();
    setAdminStatus('');
  }, [selectedExperiment, clearBuildPolling]);

  const applyImportedDraft = useCallback((payload: ImportPayload) => {
    setImportWarnings((payload.warnings as string[]) ?? []);
    setImportRawOutput(String(payload.raw_output ?? ''));
    if (payload.draft) {
      const { steps = [], container_spec: containerSpec = defaultContainerSpec(), ...draft } = payload.draft as Record<string, unknown> & { steps?: Step[]; container_spec?: ContainerSpec };
      setAdminDraft({
        status: 'active',
        schema_version: 2,
        ...draft,
      });
      setAdminStepsText(JSON.stringify(steps, null, 2));
      setAdminContainerSpecText(JSON.stringify(containerSpec, null, 2));
      setCurrentBuildId('');
      setBuildStatus('');
      setBuildLogs('');
      setBuildError('');
      setBuildDockerfile('');
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
  }, [clearBuildPolling]);

  const saveAdminExperiment = useCallback(async () => {
    if (!adminDraft) return;
    setAdminStatus('正在保存实验配置');
    try {
      const steps = JSON.parse(adminStepsText || '[]');
      const containerSpec = JSON.parse(adminContainerSpecText || '{}');
      const saved = await api.saveExperiment({ ...adminDraft, steps, container_spec: containerSpec });
      const data = await api.loadExperiments();
      setExperiments(data);
      setSelectedExperimentId(saved.id);
      setAdminStatus('实验配置已保存');
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '保存失败');
    }
  }, [adminDraft, adminStepsText, adminContainerSpecText, api]);

  const buildAdminExperiment = useCallback(async () => {
    if (!adminDraft || isBuildRunning) return;
    setAdminStatus('正在启动镜像构建');
    setBuildLogs('');
    setBuildError('');
    setBuildDockerfile('');
    try {
      const steps = JSON.parse(adminStepsText || '[]');
      const containerSpec = JSON.parse(adminContainerSpecText || '{}');
      const payload = await api.buildExperiment({ ...adminDraft, steps, container_spec: containerSpec });
      setCurrentBuildId(payload.build_id ?? payload.id ?? '');
      applyBuildState(payload);
      setTimeout(() => startBuildPolling(), 100);
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '启动构建失败');
    }
  }, [adminDraft, isBuildRunning, adminStepsText, adminContainerSpecText, api, applyBuildState, startBuildPolling]);

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

  const updateDraft = useCallback((field: string, value: string) => {
    setAdminDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  useEffect(() => {
    return () => clearBuildPolling();
  }, [clearBuildPolling]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Topbar */}
      <header className="h-14 flex items-center gap-6 px-6 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2.5 min-w-[140px]">
          <div className="w-8 h-8 grid place-items-center rounded-md text-white bg-neutral-900">
            <FlaskConical size={18} />
          </div>
          <strong className="text-neutral-900 text-sm font-semibold">教师实验管理</strong>
        </div>

        <div className="flex items-center gap-2.5 min-w-[280px]">
          <span className="text-neutral-500 text-xs font-medium">当前实验</span>
          <select
            value={selectedExperimentId}
            onChange={(e) => setSelectedExperimentId(e.target.value)}
            className="h-9 min-w-[200px] max-w-[360px] px-3 rounded-md border border-neutral-200 text-neutral-900 bg-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 hover:bg-neutral-50 transition-colors"
          >
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.name}
              </option>
            ))}
          </select>
        </div>

        <Link
          to="/"
          className="ml-auto h-8 inline-flex items-center px-3 rounded-md font-medium text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors no-underline"
        >
          返回学生端
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {adminDraft && (
          <div className="max-w-5xl mx-auto bg-white border border-neutral-200 rounded-lg p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <strong className="text-neutral-900 text-base font-semibold">实验配置</strong>
              <span className="text-neutral-500 text-sm">
                {adminStatus || '上传 Markdown/TXT 或粘贴文本生成 v2 实验草稿，确认后保存发布。'}
              </span>
            </div>

            {/* Basic Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <Field.Root>
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验ID</Field.Label>
                <input
                  value={String(adminDraft.experiment_id ?? '')}
                  onChange={(e) => updateDraft('experiment_id', e.target.value)}
                  disabled={isBuildRunning}
                  className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                />
              </Field.Root>
              <Field.Root>
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验名称</Field.Label>
                <input
                  value={String(adminDraft.name ?? '')}
                  onChange={(e) => updateDraft('name', e.target.value)}
                  disabled={isBuildRunning}
                  className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                />
              </Field.Root>
              <Field.Root>
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">系统类型</Field.Label>
                <input
                  value={String(adminDraft.system ?? '')}
                  onChange={(e) => updateDraft('system', e.target.value)}
                  disabled={isBuildRunning}
                  className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                />
              </Field.Root>
              <Field.Root>
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">Docker镜像</Field.Label>
                <input
                  value={String(adminDraft.image_name ?? '')}
                  onChange={(e) => updateDraft('image_name', e.target.value)}
                  disabled={isBuildRunning}
                  className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                />
              </Field.Root>
            </div>

            {/* Objective */}
            <Field.Root className="mb-3">
              <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验目标</Field.Label>
              <textarea
                value={String(adminDraft.objective ?? '')}
                onChange={(e) => updateDraft('objective', e.target.value)}
                rows={2}
                disabled={isBuildRunning}
                className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
              />
            </Field.Root>

            <Separator className="my-4 bg-neutral-200" />

            {/* Import Box */}
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

            {/* Warnings */}
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

            {/* Raw Output */}
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

            {/* Tabs */}
            <Tabs.Root defaultValue="text" className="mt-4">
              <Tabs.List className="flex gap-1 mb-4 border-b border-neutral-200">
                {[
                  { value: 'text', label: '文本导入' },
                  { value: 'container', label: '容器配置' },
                  { value: 'steps', label: '步骤配置' },
                  { value: 'build', label: '构建发布' },
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

              <Tabs.Panel value="container" className="space-y-3">
                <Field.Root>
                  <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">
                    容器需求 JSON
                  </Field.Label>
                  <textarea
                    value={adminContainerSpecText}
                    onChange={(e) => setAdminContainerSpecText(e.target.value)}
                    rows={12}
                    disabled={isBuildRunning}
                    className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 resize-y hover:border-neutral-300 transition-colors"
                  />
                </Field.Root>
                <span className="text-neutral-500 text-xs font-medium">
                  默认使用华为云 openEuler、清华 pip、npmmirror npm 源。
                </span>
              </Tabs.Panel>

              <Tabs.Panel value="steps" className="space-y-3">
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
                  仅保存实验配置
                </button>
              </Tabs.Panel>

              <Tabs.Panel value="build" className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
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
                        <FileCode size={14} />
                        构建容器镜像并发布
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
        )}
      </main>
    </div>
  );
}
