import { AlertTriangle, Info } from 'lucide-react';

interface ValidationSummaryProps {
  errors: string[];
  warnings: string[];
}

export default function ValidationSummary({ errors, warnings }: ValidationSummaryProps) {
  if (!errors.length && !warnings.length) return null;

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-2">
            <AlertTriangle size={13} />
            需要修正后才能继续
          </div>
          <ul className="space-y-1">
            {errors.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-red-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-2">
            <Info size={13} />
            建议检查
          </div>
          <ul className="space-y-1">
            {warnings.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-amber-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
