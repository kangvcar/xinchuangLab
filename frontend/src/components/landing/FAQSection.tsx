import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "需要本地安装虚拟机或软件吗？",
    a: "不需要。所有实验都在浏览器内通过 Web 终端完成，一键连接真实的 openEuler 系统，无需安装任何本地软件。",
  },
  {
    q: "AI 教练会直接把答案告诉我吗？",
    a: "不会。AI 教练采用引导式教学：你卡壳时给提示方向，出错时帮你分析原因。目的是培养你独立排查和解决问题的能力，而不是让你成为'伸手党'。",
  },
  {
    q: "支持哪些 Linux 发行版？",
    a: "目前支持 openEuler 等国产操作系统，后续会扩展 Kylin、统信 UOS 等更多信创生态发行版。",
  },
  {
    q: "实验环境是真实的系统还是模拟器？",
    a: "是真实的 Linux 系统实例，基于 Docker 容器化技术运行。你输入的每条命令都会在真实系统里执行，产生实际效果，和在生产服务器上操作一样。",
  },
  {
    q: "怎么知道我的操作对不对？",
    a: "每个实验步骤都配有自动校验机制。完成任务后系统会检查你的命令和输出是否符合预期，实时告诉你对错，并给出下一步建议。",
  },
  {
    q: "教师能管理学生的实验进度吗？",
    a: "可以。教师端支持查看全班学生的实验进度、能力评分和完成情况，还能自定义实验内容、配置任务步骤和验证规则。",
  },
  {
    q: "有多少个实验可以练？",
    a: "目前平台提供 20+ 个真实案例实验，涵盖文件管理、网络配置、Shell 编程、Web 服务器、数据库、DNS、Docker 容器等完整 Linux 运维知识体系。",
  },
];

function FAQItem({ faq }: { faq: typeof faqs[0] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left rounded-2xl transition-colors ${
          isOpen ? "bg-[#f5f5f5]" : "bg-[#fafafa] hover:bg-[#f5f5f5]"
        }`}
      >
        <span className="text-base text-[#181925] font-medium">
          {faq.q}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[#999] transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 pt-2">
              <p className="text-sm text-[#666] leading-relaxed">
                {faq.a}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQSection() {
  return (
    <section id="faq" className="relative py-24">
      <div className="max-w-[700px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-[#f5f5f5] text-xs text-[#999] font-medium mb-4">
            FAQ
          </span>
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            常见问题
          </h2>
          <p className="text-[#666] text-lg">
            关于实验环境、AI 陪练、学习方式的常见疑问
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {faqs.map((faq) => (
            <FAQItem key={faq.q} faq={faq} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
