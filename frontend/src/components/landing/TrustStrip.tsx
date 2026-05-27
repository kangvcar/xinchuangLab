import { motion } from "motion/react";
import { Zap, Clock, Heart } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "秒级启动，零配置",
    desc: "基于 Docker 容器化技术，实验环境秒级启动。无需安装虚拟机，打开浏览器就能连上真实的 openEuler 系统。",
  },
  {
    icon: Clock,
    title: "20+ 真实案例实验",
    desc: "覆盖文件管理、网络配置、Shell 编程、Web 服务器、Docker 容器等完整 Linux 运维知识体系。",
  },
  {
    icon: Heart,
    title: "AI 不直接给答案",
    desc: "卡壳时给你引导性提示，出错时帮你诊断原因。培养独立排查能力，而不是变成'伸手党'。",
  },
];

export default function TrustStrip() {
  return (
    <section className="relative py-24">
      <div className="max-w-[900px] mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="text-center"
              >
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-4">
                  <Icon size={20} className="text-[#9580ff]" />
                </div>
                <p className="text-base text-[#181925]">
                  <span className="font-semibold">{f.title.split("，")[0]}</span>{" "}
                  <span className="text-[#666]">{f.title.split("，").slice(1).join("，")}</span>
                </p>
                <p className="text-sm text-[#999] mt-2 leading-relaxed">
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
