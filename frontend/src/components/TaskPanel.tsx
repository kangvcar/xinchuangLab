import { ArrowRight, Terminal, Sprout, CheckCircle, Sparkles, Trophy } from 'lucide-react';
import { Progress } from '@base-ui/react/progress';
import { motion, AnimatePresence } from 'motion/react';
import StepNav from './StepNav';
import type { Step } from '@/types';

interface TaskPanelProps {
  currentSteps: Step[];
  stepProgressMap: Map<number, string>;
  currentQuestion: number;
  displayedStep?: Step;
  displayedStepStatus: string;
  progressPercent: number;
  onSelectStep: (stepId: number) => void;
  onConfirmStep: (stepId: number) => void;
  renderMarkdown: (text: string) => string | Promise<string>;
}

export default function TaskPanel({
  currentSteps,
  stepProgressMap,
  currentQuestion,
  displayedStep,
  displayedStepStatus,
  progressPercent,
  onSelectStep,
  onConfirmStep,
  renderMarkdown,
}: TaskPanelProps) {
  return (
    <section className="min-w-0 min-h-0 h-full overflow-hidden rounded-xl bg-white flex flex-col shadow-sm shadow-slate-200/50 border border-slate-200/80">
      <StepNav
        currentSteps={currentSteps}
        stepProgressMap={stepProgressMap}
        currentQuestion={currentQuestion}
        onSelectStep={onSelectStep}
      />

      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        {/* Progress */}
        {currentSteps.length > 0 && (
          <div className="max-w-[640px] mx-auto mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">实验进度</span>
              <span className={`text-xs font-bold ${progressPercent === 100 ? 'text-emerald-600' : 'text-brand-600'}`}>
                {progressPercent === 100 ? '全部完成！' : `${progressPercent}%`}
              </span>
            </div>
            <Progress.Root value={progressPercent} className="h-2 w-full rounded-full bg-slate-100 overflow-hidden relative">
              <Progress.Indicator
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  progressPercent === 100
                    ? 'bg-gradient-to-r from-emerald-400 via-brand-400 to-accent-500'
                    : 'bg-gradient-to-r from-brand-400 to-accent-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
              {progressPercent === 100 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-0 -top-1 w-4 h-4 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40"
                >
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
                </motion.div>
              )}
            </Progress.Root>
            {progressPercent === 100 && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600"
              >
                <Trophy size={12} />
                所有实验步骤已完成，太棒了！
              </motion.div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {displayedStep ? (
            <motion.div
              key={displayedStep.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`
                max-w-[640px] mx-auto transition-all
                ${displayedStepStatus === 'completed' ? 'text-emerald-950' : 'text-dark'}
              `}
            >
              {/* Title */}
              <h2 className="mb-2.5 text-lg font-bold text-dark tracking-tight leading-snug">
                {displayedStep.title}
              </h2>

              {/* Goal */}
              <div
                className="text-slate-600 leading-relaxed text-sm"
                dangerouslySetInnerHTML={{ __html: String(renderMarkdown(displayedStep.goal || displayedStep.instructions || '')) }}
              />

              {/* Try Commands */}
              {displayedStep.try_commands && displayedStep.try_commands.length > 0 && (
                <div className="mt-4 rounded-xl p-3.5 bg-brand-50/60 border border-brand-100/80 space-y-2.5">
                  <strong className="text-dark text-xs font-bold flex items-center gap-2">
                    <span className="w-5 h-5 grid place-items-center rounded-md bg-brand-500 text-white">
                      <Sprout size={12} />
                    </span>
                    建议先试试
                  </strong>
                  <div className="flex flex-wrap gap-2">
                    {displayedStep.try_commands.map((cmd) => (
                      <code key={cmd} className="bg-white text-brand-700 border border-brand-200 font-semibold text-xs shadow-sm shadow-brand-100/50">
                        {cmd}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Success Criteria */}
              <div className="mt-3 rounded-xl p-3.5 bg-emerald-50/60 border border-emerald-100/80 space-y-2.5">
                <strong className="text-dark text-xs font-bold flex items-center gap-2">
                  <span className="w-5 h-5 grid place-items-center rounded-md bg-emerald-500 text-white">
                    <CheckCircle size={12} />
                  </span>
                  完成判断
                </strong>
                <span className="text-slate-600 text-sm leading-relaxed">
                  {displayedStep.success_criteria || '按步骤目标完成操作。'}
                </span>
              </div>

              {/* Next Step Action */}
              {displayedStepStatus === 'completed' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex justify-end"
                >
                  <button
                    onClick={() => onConfirmStep(displayedStep.id)}
                    className="h-10 inline-flex items-center justify-center gap-1.5 px-5 rounded-lg font-semibold text-xs tracking-wide text-white bg-gradient-to-r from-brand-500 to-brand-600 border border-transparent hover:from-brand-600 hover:to-brand-700 hover:shadow-lg hover:shadow-brand-500/25 hover:-translate-y-px active:translate-y-0 transition-all"
                  >
                    <ArrowRight size={14} />
                    下一步
                  </button>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center gap-3 text-slate-400"
            >
              <div className="w-14 h-14 grid place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 text-brand-500">
                <Sparkles size={24} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm text-slate-700">准备好开始实验了吗？</p>
                <p className="text-xs text-slate-400 mt-1">点击右上角「开始实验」按钮启动环境</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
