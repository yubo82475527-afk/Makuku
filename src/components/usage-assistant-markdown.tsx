import { Fragment, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { locales } from "@/lib/i18n/config";

function withLocalePath(href: string, locale?: Locale) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const parts = href.split("/").filter(Boolean);
  if (parts[0] && (locales as readonly string[]).includes(parts[0])) return href;
  if (!locale) return href;
  return `/${locale}${href}`;
}

function renderInline(
  text: string,
  keyPrefix: string,
  locale?: Locale,
  onNavigate?: () => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${part++}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${part++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${part++}`}
          className="rounded bg-slate-200/80 px-1 py-0.5 font-mono text-[12px] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const rawHref = linkMatch[2].trim();
        const href = withLocalePath(rawHref, locale);
        const isExternal = href.startsWith("http://") || href.startsWith("https://");
        const safe = href.startsWith("/") || isExternal;
        nodes.push(
          safe ? (
            <a
              key={`${keyPrefix}-a-${part++}`}
              href={href}
              onClick={() => {
                if (!isExternal) onNavigate?.();
              }}
              className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[12px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 hover:text-sky-900"
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer" : undefined}
            >
              {linkMatch[1]}
            </a>
          ) : (
            <Fragment key={`${keyPrefix}-a-${part++}`}>{linkMatch[1]}</Fragment>
          ),
        );
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${part++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

function isUnorderedItem(line: string) {
  return /^[-*]\s+/.test(line);
}

function isOrderedItem(line: string) {
  return /^\d+\.\s+/.test(line);
}

function itemText(line: string) {
  return line.replace(/^([-*]|\d+\.)\s+/, "");
}

/** Lightweight Markdown renderer for usage-assistant answers (no HTML passthrough). */
export function UsageAssistantMarkdown({
  content,
  locale,
  onNavigate,
}: {
  content: string;
  locale?: Locale;
  onNavigate?: () => void;
}) {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let block = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={`h-${block++}`} className="mt-2 text-[13px] font-semibold text-slate-900 first:mt-0">
          {renderInline(line.replace(/^###\s+/, ""), `h3-${block}`, locale, onNavigate)}
        </h4>,
      );
      i += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={`h-${block++}`} className="mt-2 text-sm font-semibold text-slate-900 first:mt-0">
          {renderInline(line.replace(/^##\s+/, ""), `h2-${block}`, locale, onNavigate)}
        </h3>,
      );
      i += 1;
      continue;
    }
    if (/^#\s+/.test(line)) {
      blocks.push(
        <h3 key={`h-${block++}`} className="mt-2 text-sm font-semibold text-slate-900 first:mt-0">
          {renderInline(line.replace(/^#\s+/, ""), `h1-${block}`, locale, onNavigate)}
        </h3>,
      );
      i += 1;
      continue;
    }

    if (isUnorderedItem(line) || isOrderedItem(line)) {
      const ordered = isOrderedItem(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isOrderedItem(lines[i]) : isUnorderedItem(lines[i]))) {
        items.push(itemText(lines[i]));
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`l-${block++}`}
          className={`my-1.5 space-y-1 pl-4 text-[13px] leading-6 text-slate-800 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((item, index) => (
            <li key={`li-${block}-${index}`}>{renderInline(item, `li-${block}-${index}`, locale, onNavigate)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !/^#{1,3}\s+/.test(lines[i])
      && !isUnorderedItem(lines[i])
      && !isOrderedItem(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${block++}`} className="my-1 text-[13px] leading-6 text-slate-800 first:mt-0 last:mb-0">
        {renderInline(paragraph.join(" "), `p-${block}`, locale, onNavigate)}
      </p>,
    );
  }

  if (blocks.length === 0) {
    return <p className="text-[13px] leading-6 text-slate-800">{content}</p>;
  }

  return <div className="space-y-1">{blocks}</div>;
}
