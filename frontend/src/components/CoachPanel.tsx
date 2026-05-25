import { useEffect, useRef } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import type { AICoachRecord } from '@/types';

interface CoachPanelProps {
  aiRecords: AICoachRecord[];
  analyzingCommand: string;
  statusText: string;
  renderMarkdown: (text: string) => string | Promise<string>;
}

export default function CoachPanel({ aiRecords, analyzingCommand, statusText, renderMarkdown }: CoachPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiRecords, analyzingCommand]);

  return (
    <section className="min-w-0 min-h-0 overflow-hidden border border-neutral-200 rounded-lg bg-white flex flex-col">
      {/* Header */}
      <div className="h-11 flex items-center justify-between gap-3 px-4 border-b border-neutral-200 bg-neutral-50 shrink-0">
        <div className="inline-flex items-center gap-2 text-neutral-900 font-semibold text-sm">
          <Bot size={16} />
          <span>AI 陪练输出</span>
        </div>
        <span className="max-w-[220px] overflow-hidden text-neutral-500 text-xs font-medium text-ellipsis whitespace-nowrap">
          {statusText}
        </span>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
        {aiRecords.map((record, index) => (
          <article
            key={record.id || index}
            className="border border-neutral-200 rounded-lg p-3 bg-white transition-colors hover:bg-neutral-50"
          >
            <time className="block mb-1.5 text-neutral-400 text-[11px] font-medium">
              {record.created_at}
            </time>
            <div
              className="markdown-content text-sm text-neutral-700"
              dangerouslySetInnerHTML={{ __html: String(renderMarkdown(record.ai_response)) }}
            />
          </article>
        ))}

        {analyzingCommand && (
          <article className="flex items-start gap-2.5 border border-neutral-300 rounded-lg p-3 bg-neutral-50">
            <Bot size={16} className="shrink-0 mt-0.5 text-neutral-500" />
            <div>
              <strong className="text-sm font-medium text-neutral-900">
                正在分析：{analyzingCommand}
                <span className="inline-block w-1 h-1 ml-1 rounded-full bg-neutral-400 animate-pulse" />
              </strong>
              <span className="block mt-1 text-neutral-500 text-xs leading-relaxed">
                我会结合终端输出和当前实验步骤，给你一段有针对性的陪练反馈。
              </span>
            </div>
          </article>
        )}

        {aiRecords.length === 0 && !analyzingCommand && (
          <article className="h-full min-h-[140px] flex flex-col items-center justify-center gap-2 text-neutral-400 text-center">
            <div className="w-12 h-12 grid place-items-center rounded-lg bg-neutral-100 text-neutral-400">
              <Sparkles size={20} />
            </div>
            <strong className="text-neutral-900 font-semibold text-sm">等待第一条终端日志</strong>
            <span className="max-w-[400px] text-xs leading-relaxed">
              在右侧终端执行命令后，AI 会实时分析操作、输出和下一步建议。
            </span>
          </article>
        )}
      </div>
    </section>
  );
}
