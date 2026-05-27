import { Link, useLocation } from 'react-router-dom';


export default function Navbar() {
  const location = useLocation();
  const isLab = location.pathname === '/lab';

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <nav className="flex items-center gap-1 bg-[#181925] rounded-full px-2 py-2">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center w-8 h-8 bg-white rounded-full ml-1">
          <span className="text-[#181925] font-bold text-xs">{'>_'}</span>
        </Link>

        {/* Nav links */}
        <button
          onClick={() => scrollTo('features')}
          className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          功能
        </button>
        <button
          onClick={() => scrollTo('steps')}
          className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          流程
        </button>
        <button
          onClick={() => scrollTo('faq')}
          className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          文档
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-white/20 mx-1" />

        {/* Auth */}
        <a
          href="https://wisdomh5.zhihuishu.com/course/index/2000879101413748736?courseId=1100001801&mapVersion=0"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          学习完整Linux课程
        </a>
        <Link
          to="/lab"
          className="px-4 py-1.5 text-sm font-medium text-white bg-[#9580ff] rounded-full hover:bg-[#9580ff]/90 transition-colors"
        >
          {isLab ? '返回' : '开始实训'}
        </Link>
      </nav>
    </header>
  );
}
