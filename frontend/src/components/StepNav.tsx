import { CheckCircle2 } from 'lucide-react';
import type { Step } from '@/types';

interface StepNavProps {
  currentSteps: Step[];
  stepProgressMap: Map<number, string>;
  currentQuestion: number;
  onSelectStep: (stepId: number) => void;
}

export default function StepNav({ currentSteps, stepProgressMap, currentQuestion, onSelectStep }: StepNavProps) {
  return (
    <nav className="h-12 flex items-center gap-0 px-3 border-b border-neutral-200 bg-neutral-50 overflow-x-auto scrollbar-none shrink-0">
      {currentSteps.map((step, index) => {
        const status = stepProgressMap.get(step.id);
        const isLocked = !status || status === 'locked';
        const isCurrent = step.id === currentQuestion;
        const isCompleted = status === 'completed';
        const isConfirmed = status === 'confirmed';

        return (
          <button
            key={step.id}
            disabled={isLocked}
            onClick={() => onSelectStep(step.id)}
            className={`
              relative h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium whitespace-nowrap border transition-colors mr-3
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isCurrent
                ? 'text-white bg-neutral-900 border-neutral-900'
                : isConfirmed
                ? 'text-green-700 bg-green-50 border-green-200'
                : isCompleted
                ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-neutral-500 bg-transparent border-transparent hover:bg-neutral-100 hover:text-neutral-700'}
            `}
          >
            <span
              className={`
                w-4 h-4 grid place-items-center rounded-full text-[10px] font-bold
                ${isCurrent
                  ? 'bg-white text-neutral-900'
                  : isConfirmed
                  ? 'bg-green-500 text-white'
                  : isCompleted
                  ? 'bg-amber-500 text-white'
                  : 'bg-neutral-200 text-neutral-500'}
              `}
            >
              {step.id}
            </span>
            <span className="max-w-[120px] overflow-hidden text-ellipsis">{step.title}</span>
            {isConfirmed && <CheckCircle2 size={11} className="text-green-600 shrink-0" />}

            {/* Connector line */}
            {index < currentSteps.length - 1 && (
              <span
                className={`
                  absolute -right-2 top-1/2 -translate-y-1/2 w-1.5 h-px rounded-full
                  ${isConfirmed || isCompleted ? 'bg-green-300' : 'bg-neutral-200'}
                `}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
