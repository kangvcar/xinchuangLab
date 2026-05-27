import { motion } from "motion/react";
import { Check, Minus, X } from "lucide-react";

const competitors = ["信创Linux AI陪练", "传统虚拟机", "在线视频课", "本地实验"];
const highlights = [0];

const rows = [
  { feature: "真实系统环境", values: ["check", "check", "minus", "check"] },
  { feature: "浏览器直达", values: ["check", "minus", "check", "minus"] },
  { feature: "AI 实时陪练", values: ["check", "minus", "minus", "minus"] },
  { feature: "自动任务校验", values: ["check", "minus", "minus", "minus"] },
  { feature: "步骤化引导", values: ["check", "minus", "minus", "minus"] },
  { feature: "零配置启动", values: ["check", "minus", "check", "minus"] },
  { feature: "多用户并发", values: ["check", "check", "check", "minus"] },
];

function Cell({ value }: { value: string }) {
  if (value === "check") return <Check size={18} className="text-[#9580ff]" />;
  if (value === "minus") return <Minus size={18} className="text-[#ccc]" />;
  return <X size={18} className="text-[#ccc]" />;
}

export default function ComparisonSection() {
  return (
    <section className="relative py-24">
      <div className="max-w-[900px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-[#f5f5f5] text-xs text-[#999] font-medium mb-4">
            对比
          </span>
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            与其他学习方式的差异
          </h2>
          <p className="text-[#666] max-w-[55ch] mx-auto text-lg">
            真实系统 + AI 陪练 + 自动校验，不只是看视频或装虚拟机
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="overflow-x-auto"
        >
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left py-4 pr-4" />
                {competitors.map((name, i) => (
                  <th
                    key={name}
                    className={`py-4 px-4 text-center text-sm font-medium rounded-t-xl ${
                      highlights.includes(i)
                        ? "bg-[#fafafa] text-[#181925] border-t-2 border-[#9580ff]"
                        : "text-[#666]"
                    }`}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={row.feature}
                  className={ri % 2 === 0 ? "bg-[#fafafa]/50" : ""}
                >
                  <td className="py-4 pr-4 text-sm text-[#181925] font-medium">
                    {row.feature}
                  </td>
                  {row.values.map((val, ci) => (
                    <td
                      key={ci}
                      className={`py-4 px-4 text-center ${
                        highlights.includes(ci) ? "bg-[#fafafa]" : ""
                      }`}
                    >
                      <div className="flex justify-center">
                        <Cell value={val} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
