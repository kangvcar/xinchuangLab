import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

export default function CTASection() {
  return (
    <section className="relative py-24 bg-gradient-to-b from-purple-300/40 via-purple-400/50 to-blue-400/40">
      <div className="max-w-[700px] mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            开始你的第一个实验
          </h2>
          <p className="text-[#181925]/70 leading-relaxed max-w-[50ch] mx-auto mb-8 text-lg">
            不用安装任何东西，打开浏览器就能在真实的 openEuler 系统里练习。AI 教练随时待命。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/lab"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#181925] text-white text-base font-medium hover:bg-[#181925]/90 transition-colors"
            >
              进入实训平台
              <ArrowRight size={16} />
            </Link>
            <a
              href="https://wisdomh5.zhihuishu.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/60 text-[#181925] text-base font-medium hover:bg-white/80 transition-colors"
            >
              查看配套课程
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
