import type { ComponentProps } from "react";
import { controlClass } from "@/src/ui/form-styles";

/** Native select semantics with a predictable, inset decorative chevron. */
export function SelectControl({ className = "", ...props }: ComponentProps<"select">) {
  return <span className="relative block w-full min-w-0">
    <select {...props} className={`${controlClass} appearance-none pr-10 forced-colors:appearance-auto ${className}`} />
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#54736a] forced-colors:hidden">
      <path d="m4 6 4 4 4-4" />
    </svg>
  </span>;
}
