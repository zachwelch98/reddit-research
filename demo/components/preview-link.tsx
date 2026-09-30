"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { usePaneMounted } from "./preview";

// The previewed candidate lives in the URL as ?c=<id>. Updating it through the history API keeps
// useSearchParams in sync without a server round trip, and Back closes or restores the preview.
export function useSelectedCandidate(): number | null {
  const c = useSearchParams().get("c");
  return c ? Number(c) : null;
}

export function useSelectCandidate() {
  return useCallback((id: number | null, mode: "push" | "replace" = "push") => {
    const url = new URL(window.location.href);
    if (id == null) url.searchParams.delete("c");
    else url.searchParams.set("c", String(id));
    if (url.href === window.location.href) return;
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url.toString());
  }, []);
}

const isInteractive = (e: MouseEvent) => !!(e.target as HTMLElement).closest("a, button, select, input, textarea, label");

export function CandidateLink({ id, children, className }: { id: number; children: ReactNode; className?: string }) {
  const select = useSelectCandidate();
  const params = new URLSearchParams(useSearchParams().toString());
  params.set("c", String(id));
  return (
    <a
      href={`${usePathname()}?${params}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        select(id);
      }}
    >
      {children}
    </a>
  );
}

// A table row that previews a candidate when clicked anywhere outside its own controls.
export function SelectTr({ id, children }: { id: number; children: ReactNode }) {
  const selected = useSelectedCandidate();
  const select = useSelectCandidate();
  return (
    <tr className={`click${selected === id ? " sel" : ""}`} onClick={(e) => !isInteractive(e) && select(id)}>
      {children}
    </tr>
  );
}

export function SelectDiv({ id, className = "", style, children }: { id: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const selected = useSelectedCandidate();
  const select = useSelectCandidate();
  return (
    <div className={`${className}${selected === id ? " sel" : ""}`} style={style} onClick={(e) => !isInteractive(e) && select(id)}>
      {children}
    </div>
  );
}

export function LinkTr({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className="click" onClick={(e) => !isInteractive(e) && router.push(href)}>
      {children}
    </tr>
  );
}

// Fills the preview on arrival without adding a history entry.
export function AutoSelect({ id }: { id: number | null }) {
  const selected = useSelectedCandidate();
  const select = useSelectCandidate();
  const mounted = usePaneMounted();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!mounted || done) return;
    setDone(true);
    if (selected != null || id == null) return;
    // Child effects run before Next's router hooks into the history API during hydration, so wait
    // a tick; otherwise the URL changes but useSearchParams never sees it.
    const t = setTimeout(() => select(id, "replace"), 0);
    return () => clearTimeout(t);
    // Only on arrival: once the user closes the preview it should stay closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
  return null;
}
