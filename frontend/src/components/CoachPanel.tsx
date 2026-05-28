import { useEffect, useRef } from 'react';
import { Bot, Sparkles, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AICoachRecord } from '@/types';

interface CoachPanelProps {
  aiRecords: AICoachRecord[];
  analyzingCommand: string;
  statusText: string;
  renderMarkdown: (text: string) => string | Promise<string>;
  streamingRecord?: AICoachRecord | null;
  experimentCompleted?: boolean;
}

export default function CoachPanel({
  aiRecords,
  analyzingCommand,
  statusText,
  renderMarkdown,
  streamingRecord,
  experimentCompleted,
}: CoachPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayedRecords = streamingRecord ? [...aiRecords, streamingRecord] : aiRecords;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiRecords, analyzingCommand, streamingRecord]);

  return (
    <section className="min-w-0 min-h-0 h-full overflow-hidden rounded-xl bg-white flex flex-col shadow-sm shadow-slate-200/50 border border-slate-200/80">
      {/* Header */}
      <div className="h-11 flex items-center justify-between gap-3 px-4 border-b border-slate-200/80 bg-gradient-to-r from-brand-50/50 to-white shrink-0">
        <div className="inline-flex items-center gap-2 text-dark font-bold text-sm">
          <span className="w-6 h-6 grid place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-sm shadow-brand-500/20">
            <Bot size={14} />
          </span>
          <span>AI 陪练</span>
        </div>
        <span className="max-w-[220px] overflow-hidden text-slate-400 text-xs font-medium text-ellipsis whitespace-nowrap">
          {statusText}
        </span>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3 space-y-2.5">
        {/* Experiment completed celebration */}
        <AnimatePresence>
          {experimentCompleted && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-md shadow-emerald-100/30 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-200/20 rounded-full blur-2xl" />
              <div className="relative flex items-start gap-3">
                <span className="w-10 h-10 grid place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shrink-0 shadow-sm shadow-emerald-500/20">
                  <PartyPopper size={20} />
                </span>
                <div>
                  <strong className="text-dark text-sm font-bold">🎉 恭喜完成全部实验步骤！</strong>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                    你已经完成了所有实验任务。可以生成实验报告查看详细的学习总结和分析。
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {displayedRecords.map((record, index) => (
            <motion.article
              key={record.id || index}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="border border-slate-200/80 rounded-xl p-3.5 bg-white transition-all duration-200 hover:shadow-md hover:shadow-slate-100/50 hover:border-slate-300 relative overflow-hidden group"
            >
              {/* Left accent line */}
              <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <time className="block mb-1.5 text-slate-400 text-[11px] font-semibold">
                {record.created_at}
              </time>
              <div
                className="markdown-content text-sm text-slate-600"
                dangerouslySetInnerHTML={{ __html: String(renderMarkdown(record.ai_response)) }}
              />
              {streamingRecord?.id === record.id && (
                <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 align-middle animate-pulse" />
              )}
            </motion.article>
          ))}
        </AnimatePresence>

        {analyzingCommand && !streamingRecord && (
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 border border-brand-200 rounded-xl p-3.5 bg-gradient-to-r from-brand-50/80 to-white relative overflow-hidden"
          >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 via-transparent to-brand-500/5 animate-pulse" />
            
            <span className="relative w-8 h-8 grid place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white shrink-0 shadow-sm shadow-brand-500/20">
              <Bot size={16} />
            </span>
            <div className="relative">
              <strong className="text-sm font-semibold text-dark">
                哟，{analyzingCommand}？让我验验你这波什么水平
                <span className="inline-flex gap-0.5 ml-1.5 align-middle">
                  <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </strong>
              <span className="block mt-1 text-slate-500 text-xs leading-relaxed">
                正在扒拉你的终端输出和实验步骤，马上告诉你这操作是神是鬼。
              </span>
            </div>
          </motion.article>
        )}

        {displayedRecords.length === 0 && !analyzingCommand && !experimentCompleted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="h-full min-h-[140px] flex flex-col items-center justify-center gap-2.5 text-slate-400 text-center"
          >
            <div className="w-14 h-14 grid place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 text-brand-500 shadow-sm shadow-brand-100/30">
              <Sparkles size={24} />
            </div>
            <strong className="text-dark font-bold text-sm">别光盯着屏幕发呆啊 👀</strong>
            <span className="max-w-[400px] text-xs leading-relaxed text-slate-400">
              键盘在你手里，终端在等你，我板凳都搬好了。你倒是敲啊——敲错了算我的，一直不敲……那我可去刷视频了。
            </span>
          </motion.div>
        )}
      </div>
    </section>
  );
}
