import { useCallback } from 'react';
import type { Experiment, LabSession, StepProgressResponse, AICoachRecord, TerminalLog, BuildState, ImportPayload } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const TEACHER_PASSWORD_STORAGE_KEY = 'linux-ai-teacher-password';

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function getTeacherPassword(): string {
  return getSessionStorage()?.getItem(TEACHER_PASSWORD_STORAGE_KEY) ?? '';
}

function setTeacherPassword(password: string): void {
  getSessionStorage()?.setItem(TEACHER_PASSWORD_STORAGE_KEY, password);
}

function clearTeacherPassword(): void {
  getSessionStorage()?.removeItem(TEACHER_PASSWORD_STORAGE_KEY);
}

function adminHeaders(headers: HeadersInit = {}): HeadersInit {
  const password = getTeacherPassword();
  return password ? { ...headers, 'X-Admin-Password': password } : headers;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const payload = JSON.parse(text);
    return String(payload.detail || payload.error || text || fallback);
  } catch {
    return text || fallback;
  }
}

export function useApi() {
  const loadExperiments = useCallback(async (): Promise<Experiment[]> => {
    const response = await fetch(`${API_BASE}/api/experiments`);
    return response.json();
  }, []);

  const createSession = useCallback(async (studentId: string, experimentId: string): Promise<LabSession> => {
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, experiment_id: experimentId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '创建实训会话失败');
    }
    return response.json();
  }, []);

  const getSession = useCallback(async (sessionId: string): Promise<LabSession> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '读取实验会话失败');
    }
    return response.json();
  }, []);

  const getCurrentSession = useCallback(async (studentId: string, experimentId?: string): Promise<LabSession | null> => {
    const params = new URLSearchParams({ student_id: studentId });
    if (experimentId) params.set('experiment_id', experimentId);
    const response = await fetch(`${API_BASE}/api/sessions/current?${params.toString()}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '读取当前实验会话失败');
    }
    return response.json();
  }, []);

  const stopSession = useCallback(async (sessionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/stop`, { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '停止实验失败');
    }
  }, []);

  const resetSession = useCallback(async (sessionId: string): Promise<LabSession> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/reset`, { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '重置实验失败');
    }
    return response.json();
  }, []);

  const loadStepProgress = useCallback(async (sessionId: string): Promise<StepProgressResponse> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/steps`);
    if (!response.ok) return { progress: [], steps: [] };
    return response.json();
  }, []);

  const confirmStep = useCallback(async (sessionId: string, stepId: number): Promise<StepProgressResponse> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/steps/${stepId}/confirm`, { method: 'POST' });
    if (!response.ok) return { progress: [], steps: [] };
    return response.json();
  }, []);

  const sendMockCommand = useCallback(async (sessionId: string, command: string): Promise<{ log?: TerminalLog }> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/simulate-terminal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: command.trim() }),
    });
    return response.json();
  }, []);

  const generateReport = useCallback(async (sessionId: string): Promise<{ url: string; docx_url?: string }> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/report`, { method: 'POST' });
    if (!response.ok) throw new Error('生成报告失败');
    return response.json();
  }, []);

  const saveExperiment = useCallback(async (data: Record<string, unknown>): Promise<Experiment> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments`, {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || '保存失败');
    }
    return response.json();
  }, []);

  const buildExperiment = useCallback(async (data: Record<string, unknown>): Promise<BuildState> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments/build`, {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, '启动构建失败'));
    }
    return response.json();
  }, []);

  const importText = useCallback(async (text: string): Promise<ImportPayload> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments/import`, {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, '导入失败'));
    }
    return response.json();
  }, []);

  const importFile = useCallback(async (file: File): Promise<ImportPayload> => {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${API_BASE}/api/admin/experiments/import-file`, {
      method: 'POST',
      headers: adminHeaders(),
      body: form,
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, '上传导入失败'));
    }
    return response.json();
  }, []);

  const getBuildStatus = useCallback(async (buildId: string): Promise<BuildState> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments/builds/${buildId}`, {
      headers: adminHeaders(),
    });
    if (!response.ok) throw new Error(await errorMessage(response, '查询构建状态失败'));
    return response.json();
  }, []);

  const authenticateTeacher = useCallback(async (password: string): Promise<void> => {
    const candidate = password || getTeacherPassword();
    const response = await fetch(`${API_BASE}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate }),
    });
    if (!response.ok) {
      clearTeacherPassword();
      throw new Error(await errorMessage(response, '教师端密码错误'));
    }
    setTeacherPassword(candidate);
  }, []);

  const hasTeacherPassword = useCallback((): boolean => Boolean(getTeacherPassword()), []);

  const clearTeacherAuth = useCallback((): void => clearTeacherPassword(), []);

  const getLogs = useCallback(async (sessionId: string): Promise<{ logs: TerminalLog[]; ai_records: AICoachRecord[] }> => {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/logs`);
    if (!response.ok) return { logs: [], ai_records: [] };
    return response.json();
  }, []);

  return {
    loadExperiments,
    createSession,
    getSession,
    getCurrentSession,
    stopSession,
    resetSession,
    loadStepProgress,
    confirmStep,
    sendMockCommand,
    generateReport,
    saveExperiment,
    buildExperiment,
    importText,
    importFile,
    getBuildStatus,
    authenticateTeacher,
    hasTeacherPassword,
    clearTeacherAuth,
    getLogs,
  };
}
