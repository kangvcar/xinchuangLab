import { CheckCircle2, Lock } from 'lucide-react';
import type { Step } from '@/types';

interface StepNavProps {
  currentSteps: Step[];
  stepProgressMap: Map<number, string>;
  currentQuestion: number;
  onSelectStep: (stepId: number) => void;
}

export default function StepNav({ currentSteps, stepProgressMap, currentQuestion, onSelectStep }: StepNavProps) {
  return (
    <nav className="h-12 flex items-center gap-1 px-3 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm overflow-x-auto scrollbar-none shrink-0">
      {currentSteps.map((step, index) => {
        const status = stepProgressMap.get(step.id);
        const isLocked = !status || status === 'locked';
        const isCurrent = step.id === currentQuestion;
        const isCompleted = status === 'completed';
        const isConfirmed = status === 'confirmed';
        const isPast = isConfirmed || isCompleted;

        return (
          <div key={step.id} className="flex items-center shrink-0">
            <button
              disabled={isLocked}
              onClick={() => onSelectStep(step.id)}
              className={`
                relative h-7 inline-flex items-center gap-1.5 px-2.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all duration-200
                disabled:opacity-35 disabled:cursor-not-allowed
                ${isCurrent
                  ? 'text-white bg-gradient-to-r from-brand-500 to-brand-600 border-transparent shadow-md shadow-brand-500/25 scale-105'
                  : isConfirmed
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  : isCompleted
                  ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                  : 'text-slate-500 bg-transparent border-slate-200/60 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span
                className={`
                  w-4 h-4 grid place-items-center rounded-full text-[10px] font-bold transition-colors
                  ${isCurrent
                    ? 'bg-white/20 text-white'
                    : isConfirmed
                    ? 'bg-emerald-500 text-white'
                    : isCompleted
                    ? 'bg-amber-500 text-white'
                    : isLocked
                    ? 'bg-slate-200 text-slate-400'
                    : 'bg-slate-200 text-slate-500'}
                `}
              >
                {isConfirmed ? (
                  <CheckCircle2 size={10} className="text-white" />
                ) : isLocked ? (
                  <Lock size={8} />
                ) : (
                  step.id
                )}
              </span>
              <span className="max-w-[120px] overflow-hidden text-ellipsis">{step.title}</span>
            </button>

            {/* Connector line */}
            {index < currentSteps.length - 1 && (
              <span
                className={`
                  w-3 h-px mx-1 rounded-full transition-colors duration-300
                  ${isConfirmed ? 'bg-emerald-300' : 'bg-slate-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
