import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { motion } from "motion/react";

export default function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center pt-24 pb-8">
      <div className="max-w-[800px] mx-auto px-6 text-center">
        {/* Announcement pill */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-0 mb-8 bg-[#eef4ff] rounded-full pr-4"
        >
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#2c78fc] text-white text-xs font-semibold">
            NEW
          </span>
          <span className="text-sm text-[#2c78fc] ml-2">
            新增 openEuler 系统实验模块
          </span>
          <ChevronRight size={14} className="text-[#2c78fc]" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-[60px] text-[#181925] font-semibold leading-[1.1]"
          style={{ letterSpacing: '-2px' }}
        >
          真实 Linux 环境
          <br />
          AI 一对一陪练
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="mt-6 text-lg text-[#666] leading-relaxed max-w-[540px] mx-auto"
        >
          浏览器里操作真实的 openEuler 系统，AI 教练在你卡壳时给提示、出错时帮诊断，像有一位老师在身边一对一指导。
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.35 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/lab"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#9580ff] text-white text-base font-medium hover:bg-[#9580ff]/90 transition-colors"
          >
            进入实训
            <ArrowRight size={16} />
          </Link>
          <a
            href="https://wisdomh5.zhihuishu.com/course/index/2000879101413748736?courseId=1100001801&mapVersion=0"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#f5f5f5] text-[#666] text-base font-medium hover:bg-[#eee] transition-colors"
          >
            查看课程
          </a>
        </motion.div>
      </div>
    </section>
  );
}
