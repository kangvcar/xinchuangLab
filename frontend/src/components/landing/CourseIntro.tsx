import { motion } from "motion/react";
import { BookOpen, Award, Users, Clock, Star } from "lucide-react";

export default function CourseIntro() {
  return (
    <section className="relative py-20">
      <div className="max-w-[900px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-[#f5f5f5] text-xs text-[#999] font-medium mb-4">
            精品课程
          </span>
          <h2 className="text-4xl text-[#181925] font-medium mb-4" style={{ letterSpacing: '-1px' }}>
            Linux 操作系统配置与管理
          </h2>
          <p className="text-[#666] max-w-[60ch] mx-auto text-lg leading-relaxed">
            这是一门面向职业院校的精品在线课程，涵盖 Linux 系统认知、文件管理、网络配置、
            Shell 编程、服务运维、容器技术等五大模块，共 20+ 真实案例实验。理论与实践一体化，
            学完即可胜任企业级 Linux 运维工作。
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {[
            { icon: BookOpen, label: "5 大课程模块", desc: "系统认知到容器技术" },
            { icon: Award, label: "精品课程认证", desc: "职业院校的标杆课程" },
            { icon: Users, label: "20+ 真实案例", desc: "覆盖企业运维场景" },
            { icon: Clock, label: "64 学时", desc: "理论与实践一体化" },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="text-center">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-3">
                  <Icon size={18} className="text-[#9580ff]" />
                </div>
                <p className="text-sm font-medium text-[#181925]">{item.label}</p>
                <p className="text-xs text-[#999] mt-1">{item.desc}</p>
              </div>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-10 text-center"
        >
          <a
            href="https://wisdomh5.zhihuishu.com/course/index/2000879101413748736?courseId=1100001801&mapVersion=0"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#181925] text-white text-sm font-medium hover:bg-[#181925]/90 transition-colors"
          >
            <Star size={16} />
            查看课程详情
          </a>
        </motion.div>
      </div>
    </section>
  );
}
