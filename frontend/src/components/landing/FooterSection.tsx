import { Link } from "react-router-dom";

export default function FooterSection() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="relative pt-16 pb-8">
      <div className="max-w-[900px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-[#181925] flex items-center justify-center text-white font-mono font-bold text-xs">
                {'>'}_
              </div>
              <span className="text-sm font-medium text-[#181925]">
                信创Linux
              </span>
            </div>
            <p className="text-sm text-[#999] leading-relaxed">
              基于真实案例的 Linux 实训平台，融合 AI 智能陪练与 Web 终端实操。
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-sm font-medium text-[#181925] mb-4">平台</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/lab" className="text-sm text-[#999] hover:text-[#181925] transition-colors">
                  实训平台
                </Link>
              </li>
              <li>
                <button onClick={() => scrollTo('features')} className="text-sm text-[#999] hover:text-[#181925] transition-colors">
                  功能亮点
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('steps')} className="text-sm text-[#999] hover:text-[#181925] transition-colors">
                  使用流程
                </button>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-medium text-[#181925] mb-4">资源</h4>
            <ul className="space-y-3">
              <li>
                <a href="https://wisdomh5.zhihuishu.com/" target="_blank" rel="noreferrer" className="text-sm text-[#999] hover:text-[#181925] transition-colors">
                  在线课程
                </a>
              </li>
              <li>
                <button onClick={() => scrollTo('faq')} className="text-sm text-[#999] hover:text-[#181925] transition-colors">
                  常见问题
                </button>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-medium text-[#181925] mb-4">关于</h4>
            <ul className="space-y-3">
              <li><span className="text-sm text-[#999]">隐私政策</span></li>
              <li><span className="text-sm text-[#999]">使用条款</span></li>
              <li><span className="text-sm text-[#999]">联系我们</span></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-[#e0e0e0] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#999]">
            © {new Date().getFullYear()} 信创Linux AI实时陪练实训平台
          </p>
          <p className="text-xs text-[#999]">
            基于国产操作系统，助力信创人才培养
          </p>
        </div>
      </div>
    </footer>
  );
}
