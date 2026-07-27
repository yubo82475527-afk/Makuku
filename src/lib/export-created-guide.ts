export const EXPORT_CREATED_GUIDE_EVENT = "makuku:export-created-guide";
export const EXPORTS_MENU_TRIGGER_ATTR = "data-makuku-exports-trigger";

export type ExportCreatedGuideDetail = {
  from: { x: number; y: number } | null;
};

export function notifyExportCreated(source: HTMLElement | null | undefined) {
  if (typeof window === "undefined") return;
  const rect = source?.getBoundingClientRect();
  const detail: ExportCreatedGuideDetail = {
    from: rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null,
  };
  window.dispatchEvent(new CustomEvent(EXPORT_CREATED_GUIDE_EVENT, { detail }));
}

export function getExportsMenuTrigger(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[${EXPORTS_MENU_TRIGGER_ATTR}]`);
}
