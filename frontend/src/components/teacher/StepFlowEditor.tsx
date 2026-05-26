import { useEffect, useMemo } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import type { Step } from '@/types';
import {
  commandLinesToList,
  commandListToLines,
  parseStepsText,
  renumberSteps,
  serializeSteps,
} from '@/pages/teacherExperimentDraft';

interface StepFlowEditorProps {
  stepsText: string;
  disabled?: boolean;
  onStepsTextChange: (value: string) => void;
  onValidationError: (message: string) => void;
}

type StepTextField = 'title' | 'goal' | 'instructions' | 'success_criteria' | 'success_hint' | 'coach_focus';

const BLANK_STEP: Omit<Step, 'id'> = {
  title: '新步骤',
  hint: '',
  goal: '',
  instructions: '',
  try_commands: [],
  success_criteria: '',
  success_hint: '',
  coach_focus: '',
  verification: { checks: [] },
};

export default function StepFlowEditor({
  stepsText,
  disabled = false,
  onStepsTextChange,
  onValidationError,
}: StepFlowEditorProps) {
  const parsed = useMemo(() => {
    try {
      return { steps: parseStepsText(stepsText), error: '' };
    } catch (error) {
      return {
        steps: [] as Step[],
        error: `步骤 JSON 格式错误：${error instanceof Error ? error.message : '无法解析'}`,
      };
    }
  }, [stepsText]);

  useEffect(() => {
    onValidationError(parsed.error);
  }, [onValidationError, parsed.error]);

  const commitSteps = (nextSteps: Step[]) => {
    onStepsTextChange(serializeSteps(nextSteps));
  };

  const updateStepField = (index: number, field: StepTextField, value: string) => {
    commitSteps(
      parsed.steps.map((step, stepIndex) => (
        stepIndex === index ? { ...step, [field]: value } : step
      ))
    );
  };

  const updateCommands = (index: number, value: string) => {
    commitSteps(
      parsed.steps.map((step, stepIndex) => (
        stepIndex === index ? { ...step, try_commands: commandLinesToList(value) } : step
      ))
    );
  };

  const addStep = () => {
    commitSteps([...parsed.steps, { ...BLANK_STEP, id: parsed.steps.length + 1 }]);
  };

  const removeStep = (index: number) => {
    commitSteps(parsed.steps.filter((_, stepIndex) => stepIndex !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= parsed.steps.length) return;
    const nextSteps = [...parsed.steps];
    const [item] = nextSteps.splice(index, 1);
    nextSteps.splice(targetIndex, 0, item);
    commitSteps(renumberSteps(nextSteps));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-neutral-700" />
          <strong className="text-sm font-semibold text-neutral-900">步骤流程</strong>
          <span className="text-xs font-medium text-neutral-500">{parsed.steps.length} 个步骤</span>
        </div>
        <button
          type="button"
          onClick={addStep}
          disabled={disabled || Boolean(parsed.error)}
          className="h-8 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-900 hover:bg-neutral-50 hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} />
          添加步骤
        </button>
      </div>

      {parsed.error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{parsed.error}，请到高级配置中修正步骤 JSON。</span>
        </div>
      )}

      {!parsed.error && parsed.steps.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
          <strong className="block text-sm font-semibold text-neutral-900">还没有步骤</strong>
          <p className="mt-1 text-xs text-neutral-500">可以从导入文档生成，也可以手动添加第一步。</p>
        </div>
      )}

      {!parsed.error && parsed.steps.map((step, index) => (
        <section key={`${step.id}-${index}`} className="rounded-md border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-neutral-900 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div className="min-w-0">
                <input
                  value={step.title ?? ''}
                  onChange={(event) => updateStepField(index, 'title', event.target.value)}
                  disabled={disabled}
                  className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-neutral-900 outline-none focus:ring-0 disabled:opacity-60"
                  placeholder="步骤标题"
                />
                <div className="mt-1 text-[11px] font-mono text-neutral-500">step_id: {index + 1}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => moveStep(index, -1)}
                disabled={disabled || index === 0}
                title="上移"
                className="grid h-7 w-7 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => moveStep(index, 1)}
                disabled={disabled || index === parsed.steps.length - 1}
                title="下移"
                className="grid h-7 w-7 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowDown size={13} />
              </button>
              <button
                type="button"
                onClick={() => removeStep(index)}
                disabled={disabled}
                title="删除步骤"
                className="grid h-7 w-7 place-items-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">目标</span>
              <textarea
                value={step.goal ?? ''}
                onChange={(event) => updateStepField(index, 'goal', event.target.value)}
                rows={2}
                disabled={disabled}
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">参考命令</span>
              <textarea
                value={commandListToLines(step.try_commands)}
                onChange={(event) => updateCommands(index, event.target.value)}
                rows={2}
                disabled={disabled}
                placeholder="每行一条命令"
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">操作说明</span>
              <textarea
                value={step.instructions ?? ''}
                onChange={(event) => updateStepField(index, 'instructions', event.target.value)}
                rows={3}
                disabled={disabled}
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">成功标准</span>
              <textarea
                value={step.success_criteria ?? ''}
                onChange={(event) => updateStepField(index, 'success_criteria', event.target.value)}
                rows={2}
                disabled={disabled}
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">成功提示</span>
              <textarea
                value={step.success_hint ?? ''}
                onChange={(event) => updateStepField(index, 'success_hint', event.target.value)}
                rows={2}
                disabled={disabled}
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-900">AI 辅导关注点</span>
              <textarea
                value={step.coach_focus ?? ''}
                onChange={(event) => updateStepField(index, 'coach_focus', event.target.value)}
                rows={2}
                disabled={disabled}
                className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
              />
            </label>
          </div>
        </section>
      ))}
    </div>
  );
}
