import { motion } from "motion/react";

const steps = [
  {
    num: "01",
    title: "选择实验",
    desc: "从 20+ 个真实案例中挑选想练的实验，文件管理、网络配置、Shell 编程、Docker 容器等模块一应俱全。",
    image: "terminal",
  },
  {
    num: "02",
    title: "连接终端",
    desc: "浏览器里一键启动真实的 openEuler 系统环境。零安装、零配置，打开网页就能开始敲命令。",
    image: "connect",
  },
  {
    num: "03",
    title: "AI 指导",
    desc: "按步骤完成任务，卡壳时 AI 给提示，出错时帮诊断。每步都有明确的目标和自动校验，练完就能看见进步。",
    image: "ai",
  },
];

function StepImage({ type }: { type: string }) {
  if (type === "terminal") {
    return (
      <div className="h-32 bg-[#f5f5f5] rounded-xl flex items-center justify-center gap-3 overflow-hidden">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-sm">$</div>
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">{'>'}</div>
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">#</div>
      </div>
    );
  }
  if (type === "connect") {
    return (
      <div className="h-32 bg-[#f5f5f5] rounded-xl flex items-center justify-center overflow-hidden">
        <div className="w-12 h-12 rounded-full bg-[#9580ff] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-white" />
        </div>
      </div>
    );
  }
  return (
    <div className="h-32 bg-[#f5f5f5] rounded-xl flex items-center justify-center overflow-hidden">
      <div className="text-4xl">🤖</div>
    </div>
  );
}

export default function StepsSection() {
  return (
    <section id="steps" className="relative py-24">
      <div className="max-w-[900px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-[#f5f5f5] text-xs text-[#999] font-medium mb-4">
            使用流程
          </span>
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            三步开始动手实训
          </h2>
          <p className="text-[#666] max-w-[55ch] mx-auto text-lg">
            不用装虚拟机，不用配环境，打开浏览器就能在真实系统里练习
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="rounded-3xl bg-[#fafafa] p-6"
            >
              <StepImage type={step.image} />
              <div className="mt-4 text-center">
                <span className="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-sm font-medium mb-3">
                  {step.num}
                </span>
                <p className="text-base text-[#181925]">
                  <span className="font-semibold">{step.title}。</span>{" "}
                  <span className="text-[#666]">{step.desc}</span>
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
