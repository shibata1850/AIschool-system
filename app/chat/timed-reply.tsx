"use client";

import { useEffect, useRef } from "react";

export function TimedReply({ reply, startedAt }: { reply?: string; startedAt: number }) {
  const element = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!reply?.trim()) return;
    let secondFrame = 0;
    // React has committed the reply. Two frames approximate render readiness, not physical paint.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const node = element.current;
        if (!node) return;
        const elapsedMs = Math.ceil(performance.now() - startedAt);
        const rect = node.getBoundingClientRect();
        const inViewport = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 &&
          rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        const documentVisible = document.visibilityState === "visible";
        node.dataset.f2RenderMs = String(elapsedMs);
        node.dataset.f2InViewport = String(inViewport);
        node.dataset.f2DocumentVisible = String(documentVisible);
        console.info(`[F2_UI] method=reply-render-ready-v1 elapsedMs=${elapsedMs} documentVisible=${documentVisible} inViewport=${inViewport}`);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [reply, startedAt]);

  return <p ref={element} style={{ whiteSpace: "pre-wrap" }}>AI講師: {reply}</p>;
}
