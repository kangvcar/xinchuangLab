import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';

export default function Navbar() {
  const location = useLocation();
  const isLab = location.pathname === '/lab';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const navLinks = [
    { label: '功能', onClick: () => scrollTo('features') },
    { label: '流程', onClick: () => scrollTo('steps') },
    { label: '文档', onClick: () => scrollTo('faq') },
  ];

  return (
    <>
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <nav className="flex items-center gap-1 bg-[#181925] rounded-full px-2 py-2 shadow-xl shadow-black/25 ring-1 ring-white/10">
          {/* Logo */}
          <Link to="/" className="ml-1 shrink-0">
            <LogoIcon variant="light" size={32} />
          </Link>

          {/* Desktop Nav links */}
          <div className="hidden md:flex items-center">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={link.onClick}
                className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
              >
                {link.label}
              </button>
            ))}

            {/* Divider */}
            <div className="w-px h-4 bg-white/20 mx-1" />

            {/* Auth */}
            <a
              href="https://wisdomh5.zhihuishu.com/course/index/2000879101413748736?courseId=1100001801&mapVersion=0"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors whitespace-nowrap"
            >
              学习完整Linux课程
            </a>
          </div>

          {/* CTA - always visible */}
          <Link
            to="/lab"
            className="ml-2 px-4 py-1.5 text-sm font-medium text-white bg-[#9580ff] rounded-full hover:bg-[#9580ff]/90 transition-colors shrink-0"
          >
            {isLab ? '返回' : '开始实训'}
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden ml-1 h-8 w-8 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="打开菜单"
          >
            <Menu size={20} />
          </button>
        </nav>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <div className="absolute top-4 left-4 right-4 bg-[#181925] rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                <LogoIcon variant="light" size={36} />
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 w-10 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="关闭菜单"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={link.onClick}
                  className="h-12 px-4 rounded-xl text-left text-base text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {link.label}
                </button>
              ))}
              <div className="h-px bg-white/10 my-2" />
              <a
                href="https://wisdomh5.zhihuishu.com/course/index/2000879101413748736?courseId=1100001801&mapVersion=0"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="h-12 px-4 rounded-xl flex items-center text-base text-white/80 hover:text-white hover:bg-white/10 transition-colors no-underline"
              >
                学习完整Linux课程
              </a>
              <Link
                to="/lab"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[#9580ff] text-white font-medium hover:bg-[#9580ff]/90 transition-colors no-underline"
              >
                {isLab ? '返回' : '开始实训'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
