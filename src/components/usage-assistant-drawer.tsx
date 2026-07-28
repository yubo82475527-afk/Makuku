"use client";

import { Bot, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UsageAssistantMarkdown } from "@/components/usage-assistant-markdown";
import type { Locale } from "@/lib/i18n/config";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  grounding?: string;
  recorded?: boolean;
};

const quickQuestions = {
  zh: [
    "怎么做价格审核？",
    "巡店状态什么意思？",
    "真实价格从哪来？",
  ],
  en: [
    "How to review prices?",
    "What do visit statuses mean?",
    "Where do real prices come from?",
  ],
} as const;

function BotMark({ size = "sm" }: { size?: "sm" | "md" }) {
  const wrap = size === "md" ? "h-7 w-7 rounded-md" : "h-4 w-4 rounded-[4px]";
  const icon = size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-sky-500 to-teal-500 text-white ${wrap}`}>
      <Bot className={icon} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export function UsageAssistantDrawer({
  locale,
  currentPath,
}: {
  locale: Locale;
  currentPath: string;
}) {
  const isZh = locale === "zh";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeMeta, setKnowledgeMeta] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasConversation = messages.length > 0;

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages, busy]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const history = messages
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content }));
      const response = await fetch("/api/usage-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          locale,
          currentPath,
          history,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Request failed");
      if (json.knowledge?.generatedAt) {
        setKnowledgeMeta(
          isZh
            ? `知识更新于 ${new Date(json.knowledge.generatedAt).toLocaleString()}`
            : `Knowledge updated ${new Date(json.knowledge.generatedAt).toLocaleString()}`,
        );
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: String(json.answer ?? ""),
          grounding: json.grounding,
          recorded: Boolean(json.recorded) && json.grounding !== "grounded",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-medium leading-4 text-slate-700 hover:border-sky-300 hover:bg-sky-100"
        title={isZh ? "AI 使用助手" : "AI Assistant"}
      >
        <BotMark />
        <span className="hidden text-xs font-medium leading-4 sm:inline">{isZh ? "AI 使用助手" : "AI Assistant"}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <button type="button" className="flex-1" aria-label="Close" onClick={() => setOpen(false)} />
          <aside className="flex h-full w-full max-w-[28rem] flex-col border-l border-slate-200 bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <BotMark size="md" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-5 text-slate-900">
                    {isZh ? "AI 使用助手" : "AI Assistant"}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] font-normal leading-4 text-slate-400">
                    {knowledgeMeta
                      || (isZh ? "基于系统使用说明回答" : "Answers from the usage guide")}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={isZh ? "关闭" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!hasConversation ? (
                <div className="space-y-3">
                  <p className="text-[13px] leading-6 text-slate-500">
                    {isZh
                      ? "可以问菜单入口、操作步骤或状态含义。"
                      : "Ask about menus, steps, or status meanings."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(isZh ? quickQuestions.zh : quickQuestions.en).map((item) => (
                      <button
                        key={item}
                        type="button"
                        disabled={busy}
                        onClick={() => void send(item)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === "user";
                const isFallback = message.role === "assistant" && message.recorded;
                return (
                  <div
                    key={message.id}
                    className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
                      isUser
                        ? "ml-auto bg-slate-900 text-white"
                        : isFallback
                          ? "border border-amber-200 bg-amber-50 text-slate-800"
                          : "border-l-[3px] border-l-sky-400 bg-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className={isUser ? "whitespace-pre-wrap" : undefined}>
                      {message.role === "assistant"
                        ? (
                          <UsageAssistantMarkdown
                            content={message.content}
                            locale={locale}
                            onNavigate={() => setOpen(false)}
                          />
                        )
                        : message.content}
                    </div>
                    {isFallback ? (
                      <div className="mt-1.5 text-[11px] text-amber-800/80">
                        {isZh ? "本问题已记录，便于 IT 补充知识" : "Recorded so IT can enrich the knowledge base"}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {busy ? (
                <div className="inline-flex items-center gap-2 rounded-lg border-l-[3px] border-l-sky-400 bg-slate-200/70 px-3 py-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isZh ? "思考中…" : "Thinking…"}
                </div>
              ) : null}
              {error ? <div className="text-xs text-rose-600">{error}</div> : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="border-t border-slate-200 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={isZh ? "询问系统怎么用…" : "Ask how to use the system…"}
                  className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-3 text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
