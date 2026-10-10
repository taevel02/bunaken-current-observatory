export function LoadingBlock({className, label}: {className: string; label?: string}) {
  return <span className={`inline-block rounded bg-[#e8efec] motion-safe:animate-pulse ${className}`} aria-hidden={label ? undefined : true} role={label ? "status" : undefined} aria-label={label}/>;
}

export function LoadingChart({label}: {label:string}) {
  return <div className="h-44" role="status" aria-label={label} aria-busy="true"><LoadingBlock className="block! h-[142px] w-full"/><div className="flex h-[34px] items-end justify-between pb-1 pl-[52px] pr-4 text-sm text-[#49625c]">{[8,10,12,14,16].map(hour=><span key={hour}>{hour}:00</span>)}</div></div>;
}
