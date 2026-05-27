import { motion } from "motion/react";
import { ArrowRight, Globe, BrainCircuit, ClipboardCheck, Gauge } from "lucide-react";

const features = [
  {
    id: "ai",
    gradient: "from-green-400 to-emerald-500",
    title: "AI 智能陪练",
    heading: "不是给答案，而是教你排查",
    points: [
      { icon: "✓", color: "text-green-500", text: "命令出错时实时诊断原因" },
      { icon: "✦", color: "text-green-500", text: "卡壳时给引导性提示" },
      { icon: "☺", color: "text-green-500", text: "每步都有 coach_focus 指导" },
    ],
    chart: "bar",
  },
  {
    id: "terminal",
    gradient: "from-blue-400 to-blue-500",
    title: "Web 终端实操",
    heading: "浏览器里操作真实系统",
    points: [
      { icon: "☺", color: "text-blue-500", text: "支持 openEuler / Kylin 等国产系统" },
      { icon: "🌐", color: "text-blue-500", text: "零安装，打开浏览器就能练" },
      { icon: "✦", color: "text-blue-500", text: "所有命令在真实环境执行" },
    ],
    chart: "globe",
  },
  {
    id: "task",
    gradient: "from-pink-400 to-rose-500",
    title: "任务驱动学习",
    heading: "每个实验拆成可执行的步骤",
    points: [
      { icon: "◷", color: "text-pink-500", text: "目标、指令、参考命令一应俱全" },
      { icon: "📱", color: "text-pink-500", text: "自动校验，实时反馈对错" },
      { icon: "✓", color: "text-pink-500", text: "覆盖 20+ 真实运维场景" },
    ],
    chart: "list",
  },
  {
    id: "monitor",
    gradient: "from-amber-400 to-orange-500",
    title: "进度与能力追踪",
    heading: "学习路径一目了然",
    points: [
      { icon: "◔", color: "text-amber-500", text: "实验完成进度实时同步" },
      { icon: "✓", color: "text-amber-500", text: "能力图谱自动构建" },
      { icon: "▤", color: "text-amber-500", text: "教师端可查看全班数据" },
    ],
    chart: "gauge",
  },
];

function MockChart({ type }: { type: string }) {
  if (type === "bar") {
    return (
      <div className="mt-4 space-y-2">
        {[
          { name: "文件管理", val: "已完成" },
          { name: "网络配置", val: "85%" },
          { name: "Shell 编程", val: "60%" },
          { name: "Web 服务器", val: "30%" },
          { name: "Docker", val: "未开始" },
        ].map((item, i) => (
          <div key={item.name} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-[#f5f5f5] flex items-center justify-center text-xs">{item.name[0]}</div>
            <span className="text-xs text-[#666] w-20">{item.name}</span>
            <div className="flex-1 h-6 bg-[#f5f5f5] rounded-lg overflow-hidden">
              <div className="h-full bg-green-100 rounded-lg" style={{ width: `${100 - i * 18}%` }} />
            </div>
            <span className="text-xs text-[#666] w-12 text-right">{item.val}</span>
          </div>
        ))}
      </div>
    );
  }
  if (type === "globe") {
    return (
      <div className="mt-4 relative h-32 bg-blue-50 rounded-xl overflow-hidden flex items-center justify-center">
        <Globe size={48} className="text-blue-200" />
        <div className="absolute top-4 right-4 bg-[#181925] text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <span>🌐</span> online
        </div>
      </div>
    );
  }
  if (type === "list") {
    return (
      <div className="mt-4 space-y-2">
        {[
          { name: "步骤 1：查看素材", badge: "已完成", time: "2m" },
          { name: "步骤 2：创建目录", badge: "进行中", time: "5m" },
          { name: "步骤 3：复制文件", badge: "未开始", time: "—" },
        ].map((u) => (
          <div key={u.name} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-pink-100" />
            <span className="text-xs text-[#181925] flex-1">{u.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${u.badge === "已完成" ? "bg-green-100 text-green-600" : u.badge === "进行中" ? "bg-amber-100 text-amber-600" : "bg-[#f5f5f5] text-[#999]"}`}>{u.badge}</span>
            <span className="text-xs text-[#999] w-8 text-right">{u.time}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center justify-center h-32">
      <div className="w-20 h-20 rounded-full border-4 border-green-400 flex items-center justify-center">
        <span className="text-2xl font-medium">87</span>
      </div>
      <div className="ml-4">
        <p className="text-sm font-medium">能力评分</p>
        <p className="text-xs text-[#999]">文件管理模块表现良好。</p>
      </div>
    </div>
  );
}

export default function FeatureTabs() {
  return (
    <section id="features" className="relative py-24">
      <div className="max-w-[1000px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-[#f5f5f5] text-xs text-[#999] font-medium mb-4">
            功能亮点
          </span>
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            从入门到运维，一站练透
          </h2>
          <p className="text-[#666] max-w-[55ch] mx-auto text-lg">
            AI 陪练、真实系统、自动校验、进度追踪，打造闭环实训体验
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="rounded-3xl bg-[#fafafa] p-8"
            >
              <h3 className={`text-lg font-medium bg-gradient-to-r ${f.gradient} bg-clip-text text-transparent mb-2`}>
                {f.title}
              </h3>
              <p className="text-xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-0.5px' }}>
                {f.heading}
              </p>
              <div className="space-y-2 mb-4">
                {f.points.map((p) => (
                  <div key={p.text} className="flex items-center gap-2 text-sm">
                    <span className={p.color}>{p.icon}</span>
                    <span className="text-[#666]">{p.text}</span>
                  </div>
                ))}
              </div>
              <div className="h-0 mb-4" />
              <MockChart type={f.chart} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
