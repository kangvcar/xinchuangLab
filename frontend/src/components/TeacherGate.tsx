import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, LockKeyhole, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';

interface TeacherGateProps {
  children: ReactNode;
}

export default function TeacherGate({ children }: TeacherGateProps) {
  const { authenticateTeacher, clearTeacherAuth, hasTeacherPassword } = useApi();
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasTeacherPassword()) {
      setChecking(false);
      return;
    }
    authenticateTeacher('')
      .then(() => setAuthenticated(true))
      .catch(() => {
        clearTeacherAuth();
        setAuthenticated(false);
      })
      .finally(() => setChecking(false));
  }, [authenticateTeacher, clearTeacherAuth, hasTeacherPassword]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await authenticateTeacher(password);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '教师端密码错误');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-white text-neutral-500">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="h-14 flex items-center px-6 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 grid place-items-center rounded-md text-white bg-neutral-900">
            <FlaskConical size={18} />
          </div>
          <strong className="text-neutral-900 text-sm font-semibold">教师端验证</strong>
        </div>
        <Link
          to="/lab"
          className="ml-auto h-8 inline-flex items-center px-3 rounded-md font-medium text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors no-underline"
        >
          返回学生端
        </Link>
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-[360px] border border-neutral-200 rounded-lg bg-white p-6 shadow-sm"
        >
          <div className="w-10 h-10 rounded-md bg-neutral-900 text-white grid place-items-center mb-4">
            <LockKeyhole size={20} />
          </div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">输入教师端密码</h1>
          <p className="text-sm text-neutral-500 leading-relaxed mb-5">
            教师管理页面包含实验配置、镜像构建和发布能力，需要验证后访问。
          </p>
          <label className="text-xs font-semibold text-neutral-900 block mb-1.5" htmlFor="teacher-password">
            密码
          </label>
          <input
            id="teacher-password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-10 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900"
          />
          {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!password || submitting}
            className="mt-5 h-10 w-full inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            进入教师端
          </button>
        </form>
      </main>
    </div>
  );
}
