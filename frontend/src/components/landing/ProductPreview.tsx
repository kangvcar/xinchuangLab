import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const tabs = ["终端实操", "AI 陪练", "任务面板", "实验报告", "实时监控"];

function MockDashboard() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#181925]" />
          <span className="text-sm font-medium text-[#181925]">student@openeuler</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#f5f5f5]" />
      </div>

      {/* Task picker */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f5f5f5] text-sm text-[#666] mb-6">
        Linux 文件管理
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        {[
          { label: "总步骤", value: "8", change: "已完成 3", color: "text-[#33c758]" },
          { label: "已用时", value: "12m", change: "-30%", color: "text-[#33c758]" },
          { label: "命令数", value: "24", change: "+5", color: "text-[#666]" },
          { label: "正确率", value: "95%", change: "0%", color: "text-[#666]" },
          { label: "AI 提示", value: "6", change: "+2", color: "text-[#9580ff]" },
          { label: "得分", value: "87", change: "+12%", color: "text-[#33c758]" },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-xs text-[#999] mb-1">{stat.label}</p>
            <p className="text-sm font-medium text-[#181925]">{stat.value}</p>
            <p className={`text-xs ${stat.color}`}>{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="relative h-48 mb-6">
        <svg viewBox="0 0 600 120" className="w-full h-full">
          <path
            d="M0,80 Q50,20 100,60 T200,50 T300,70 T400,40 T500,55 T600,45"
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="1.5"
          />
          <path
            d="M0,90 Q50,85 100,88 T200,86 T300,89 T400,84 T500,87 T600,85"
            fill="none"
            stroke="#9580ff"
            strokeWidth="1.5"
            opacity="0.6"
          />
          <circle cx="150" cy="65" r="4" fill="#33c758" />
          <circle cx="350" cy="55" r="4" fill="#33c758" />
          <rect x="450" y="30" width="8" height="40" rx="4" fill="#33c758" />
        </svg>
      </div>

      {/* Bottom cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#fafafa] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#181925]">当前步骤：创建目录</span>
            <span className="text-xs text-[#999]">步骤 4/8 {'>'}</span>
          </div>
          <div className="flex items-end gap-1 h-12">
            {[40, 20, 60, 30, 50, 25, 70, 35, 45, 55, 30, 65].map((h, i) => (
              <div key={i} className="flex-1 bg-[#9580ff] rounded-sm" style={{ height: `${h}%`, opacity: i % 3 === 0 ? 1 : 0.4 }} />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-[#fafafa] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#181925]">能力评估</span>
            <span className="text-xs text-[#999]">详情 {'>'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-[#33c758] flex items-center justify-center">
              <span className="text-sm font-medium">87</span>
            </div>
            <div>
              <p className="text-sm font-medium">良好</p>
              <p className="text-xs text-[#999]">文件管理能力持续提升中。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductPreview() {
  const [activeTab, setActiveTab] = useState("终端实操");

  return (
    <section className="relative">
      {/* Trust strip above gradient */}
      <div className="pb-8">
        <div className="max-w-[900px] mx-auto px-6">
          <p className="text-center text-xs text-[#999] uppercase tracking-widest mb-6">
            支持国产操作系统与信创生态
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-50 grayscale">
            {["openEuler", "Kylin OS", "鲲鹏", "统信 UOS", "龙芯"].map((name) => (
              <span key={name} className="text-sm font-medium text-[#666]">{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Purple gradient section */}
      <div className="bg-gradient-to-b from-purple-200/60 via-purple-300/50 to-blue-300/40 pt-12 pb-24">
        <div className="max-w-[1000px] mx-auto px-6">
          {/* Tab bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center mb-0"
          >
            <div className="inline-flex items-center bg-white rounded-t-2xl px-2 pt-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab
                      ? "bg-[#f5f5f5] text-[#181925]"
                      : "text-[#999] hover:text-[#181925]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Product screenshot card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="bg-white rounded-2xl rounded-tl-none rounded-tr-none shadow-2xl shadow-purple-500/10 overflow-hidden"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <MockDashboard />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
