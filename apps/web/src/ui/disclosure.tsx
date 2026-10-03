import type { ReactNode } from "react";

export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return <details>
    <summary className="box-border min-h-11 cursor-pointer py-2 text-sm text-[#155f53] focus-visible:outline-2">{summary}</summary>
    <div className="grid gap-1 pb-1 text-sm [&_p]:m-0">{children}</div>
  </details>;
}
