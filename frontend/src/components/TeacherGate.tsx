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
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-brand-100/40 to-transparent pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-brand-200/20 rounded-full blur-3xl pointer-events-none" />
      
      <header className="h-14 flex items-center px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 grid place-items-center rounded-lg text-white bg-gradient-to-br from-brand-500 to-brand-600 shadow-sm shadow-brand-500/20">
            <FlaskConical size={18} />
          </div>
          <strong className="text-dark text-sm font-bold tracking-tight">教师端验证</strong>
        </div>
        <Link
          to="/lab"
          className="ml-auto h-8 inline-flex items-center px-3 rounded-lg font-semibold text-xs border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-dark hover:border-slate-300 active:bg-slate-100 transition-all no-underline shadow-sm"
        >
          返回学生端
        </Link>
      </header>

      <main className="flex-1 grid place-items-center p-6 relative z-10">
        <form
          onSubmit={submit}
          className="w-full max-w-[360px] border border-slate-200/80 rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/50"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center mb-4 shadow-lg shadow-brand-500/25">
            <LockKeyhole size={20} />
          </div>
          <h1 className="text-lg font-bold text-dark tracking-tight mb-2">输入教师端密码</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-5">
            教师管理页面包含实验配置、镜像构建和发布能力，需要验证后访问。
          </p>
          <label className="text-xs font-bold text-dark block mb-1.5" htmlFor="teacher-password">
            密码
          </label>
          <input
            id="teacher-password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-11 px-4 rounded-xl border-0 bg-slate-50 text-dark text-sm outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white placeholder:text-slate-400"
          />
          {error && <p className="mt-3 text-xs font-bold text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}
          <button
            type="submit"
            disabled={!password || submitting}
            className="mt-5 h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold shadow-lg shadow-brand-500/20 hover:from-brand-600 hover:to-brand-700 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            进入教师端
          </button>
        </form>
      </main>
    </div>
  );
}
