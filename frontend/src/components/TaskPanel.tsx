import { ArrowRight, Terminal, Sprout, CheckCircle } from 'lucide-react';
import { Progress } from '@base-ui/react/progress';
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
    <section className="min-w-0 min-h-0 overflow-hidden border border-neutral-200 rounded-lg bg-white flex flex-col">
      <StepNav
        currentSteps={currentSteps}
        stepProgressMap={stepProgressMap}
        currentQuestion={currentQuestion}
        onSelectStep={onSelectStep}
      />

      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        {/* Progress */}
        {currentSteps.length > 0 && (
          <div className="max-w-[640px] mx-auto mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-neutral-500">实验进度</span>
              <span className="text-xs font-semibold text-neutral-900">{progressPercent}%</span>
            </div>
            <Progress.Root value={progressPercent} className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
              <Progress.Indicator
                className="h-full rounded-full bg-neutral-900 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </Progress.Root>
          </div>
        )}

        {displayedStep ? (
          <div
            className={`
              max-w-[640px] mx-auto mb-4 bg-white transition-all
              ${displayedStepStatus === 'completed' ? 'text-green-950' : 'text-neutral-900'}
            `}
          >
            {/* Title */}
            <h2 className="mb-2 text-lg font-semibold text-neutral-900 tracking-tight">
              {displayedStep.title}
            </h2>

            {/* Goal */}
            <p className="text-neutral-600 leading-relaxed text-sm">
              {displayedStep.goal || displayedStep.instructions}
            </p>

            {/* Try Commands */}
            {displayedStep.try_commands && displayedStep.try_commands.length > 0 && (
              <div className="mt-3 rounded-md p-3 bg-neutral-50 border border-neutral-200 space-y-2">
                <strong className="text-neutral-900 text-xs font-semibold flex items-center gap-1.5">
                  <Sprout size={13} className="text-green-600" />
                  建议先试试
                </strong>
                <div className="flex flex-wrap gap-2">
                  {displayedStep.try_commands.map((cmd) => (
                    <code key={cmd} className="bg-green-50 text-green-700 border border-green-200 font-semibold text-xs">
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Success Criteria */}
            <div className="mt-3 rounded-md p-3 bg-neutral-50 border border-neutral-200 space-y-2">
              <strong className="text-neutral-900 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle size={13} className="text-green-600" />
                完成判断
              </strong>
              <span className="text-neutral-600 text-sm leading-relaxed">
                {displayedStep.success_criteria || '按步骤目标完成操作。'}
              </span>
            </div>

            {/* Next Step Action */}
            {displayedStepStatus === 'completed' && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => onConfirmStep(displayedStep.id)}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-md font-medium text-xs tracking-wide text-white bg-neutral-900 border border-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 transition-colors"
                >
                  <ArrowRight size={14} />
                  下一步
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
            <Terminal size={28} />
            <p className="font-medium text-sm">请开始实验以查看任务</p>
          </div>
        )}
      </div>
    </section>
  );
}
