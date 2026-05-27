import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const tabs = ["终端实操", "AI 陪练", "任务面板", "实验报告", "实时监控"];

const tabImages: Record<string, string> = {
  "终端实操": "/image-terminal.png",
  "AI 陪练": "/image-ai.png",
  "任务面板": "/image-step.png",
  "实验报告": "/image-report.png",
  "实时监控": "/image-teacher.png",
};

export default function ProductPreview() {
  const [activeTab, setActiveTab] = useState("终端实操");
  const activeImage = tabImages[activeTab] ?? tabImages["终端实操"];

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
                <img
                  src={activeImage}
                  alt={`${activeTab}示意图`}
                  className="w-full h-auto object-cover"
                />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
