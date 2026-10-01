import { messages } from "@/i18n/messages";

export function PCIReference({ locale }: { locale: "ko" | "en" }) {
  const t = messages[locale].observations;
  const rows = [
    ["0.0", t.pciReference0],
    ["0.2", t.pciReference2],
    ["0.4", t.pciReference4],
    ["0.6", t.pciReference6],
    ["0.8", t.pciReference8],
    ["1.0", t.pciReference10],
    [t.pciReferenceAbove, t.pciReferenceAboveDescription],
  ];
  return (
    <details className="min-w-0 rounded-md border border-[#c8d6d0] bg-white">
      <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 font-semibold text-[#155f53] active:bg-[#e8efec] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#72b7a5]">
        {t.pciReferenceTitle}
      </summary>
      <div className="grid gap-3 px-3 pb-3">
        <dl className="m-0 divide-y divide-[#c8d6d0]">
          {rows.map(([value, description]) => (
            <div key={value} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
              <dt className="font-semibold tabular-nums">{value}</dt>
              <dd className="m-0 min-w-0 break-words">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
