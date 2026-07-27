"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import {
  EXPORT_CREATED_GUIDE_EVENT,
  getExportsMenuTrigger,
  type ExportCreatedGuideDetail,
} from "@/lib/export-created-guide";

type FlightState = {
  key: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

/**
 * Visual guide after async export job creation:
 * a compact download chip flies from the page "导出数据" button to the header
 * Exports control (Amazon-style "item to cart"), so users learn where to download.
 */
export function ExportCreatedGuideLayer() {
  const [flight, setFlight] = useState<FlightState | null>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    function onGuide(event: Event) {
      const detail = (event as CustomEvent<ExportCreatedGuideDetail>).detail;
      const target = getExportsMenuTrigger();
      const targetRect = target?.getBoundingClientRect();
      const toX = targetRect
        ? targetRect.left + targetRect.width / 2
        : Math.max(window.innerWidth - 96, 48);
      const toY = targetRect
        ? targetRect.top + targetRect.height / 2
        : 40;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduceMotion || !detail?.from) {
        setArrived(true);
        window.setTimeout(() => setArrived(false), 1600);
        return;
      }

      setFlight({
        key: Date.now(),
        fromX: detail.from.x,
        fromY: detail.from.y,
        toX,
        toY,
      });
      setArrived(false);
    }

    window.addEventListener(EXPORT_CREATED_GUIDE_EVENT, onGuide);
    return () => window.removeEventListener(EXPORT_CREATED_GUIDE_EVENT, onGuide);
  }, []);

  useEffect(() => {
    if (!flight) return;
    const start = window.setTimeout(() => setArrived(true), 20);
    const end = window.setTimeout(() => {
      setFlight(null);
      setArrived(false);
    }, 900);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [flight]);

  if (!flight) return null;

  const x = arrived ? flight.toX : flight.fromX;
  const y = arrived ? flight.toY : flight.fromY;
  const scale = arrived ? 0.55 : 1;
  const opacity = arrived ? 0 : 1;

  return (
    <div
      key={flight.key}
      aria-hidden
      className="pointer-events-none fixed z-[80] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white shadow-lg"
      style={{
        left: x,
        top: y,
        opacity,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transition: "left 700ms cubic-bezier(0.22, 1, 0.36, 1), top 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease 500ms",
      }}
    >
      <Download className="h-4 w-4 text-slate-800" />
    </div>
  );
}
