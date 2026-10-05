"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { RESEARCH_DOCUMENTS,researchTemplate,researchBody,renderResearchMetrics,canonicalResearch } from "@bunaken/contracts/research";
import type { ResearchRelease,ResearchResults } from "@bunaken/contracts/research";
import seedResults from "@research-evidence/results.json";
import evidence from "@research-evidence/manifest.json";
import { ResearchMarkdown } from "@/src/public/research-markdown";
import { ResearchResults as ResearchResultsView } from "@/src/public/research-results";
import { controlClass,primaryButtonClass } from "@/src/ui/form-styles";

type IndexRow={slug:string;version:string;revision:number;state:string};
const digest=async(raw:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))),byte=>byte.toString(16).padStart(2,"0")).join("");
export function ResearchWorkspace({locale,observerAlias}:{locale:"ko"|"en";observerAlias:string}) {
  const t=messages[locale].research;
  const makeRelease=():ResearchRelease=>({schema_version:"1.0",slug:"bunaken-pci-methodology",version:"1.0.0",data_cutoff:seedResults.data_cutoff,model_version:seedResults.model_version,dataset_sha256:seedResults.dataset_sha256,revision:1,state:"draft",title:{ko:"",en:""},authors:[{alias:observerAlias,role:""}],source_data_commit:evidence.source_data_commit,code_commit:evidence.code_commit,results_sha256:evidence.results_canonical_sha256,peer_review_status:"not_peer_reviewed",change_reason:"",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),reviews:{translation:false,narrative:false,rights:false,real_synthetic:false,results:false},references:[],files:Object.fromEntries(RESEARCH_DOCUMENTS.map(file=>[file,"0".repeat(64)]))});
  const [release,setRelease]=useState(makeRelease);
  const [metadata,setMetadata]=useState(()=>JSON.stringify(release,null,2));
  const [resultsText,setResultsText]=useState(()=>JSON.stringify(seedResults,null,2));
  const [bodies,setBodies]=useState<Record<string,string>>(()=>Object.fromEntries(RESEARCH_DOCUMENTS.map(file=>[file,""])));
  const [file,setFile]=useState("technical.ko.md");const [expected,setExpected]=useState<number|null>(null);
  const [rows,setRows]=useState<IndexRow[]>([]);const [notice,setNotice]=useState<string>(t.loading);
  const [busy,setBusy]=useState(false);const [preview,setPreview]=useState(false);
  const pending=useRef<{key:string;body:string}|null>(null);
  const lock=useRef(false);
  const reload=async()=>{const response=await fetch("/api/admin/research",{cache:"no-store"});if(!response.ok)throw new Error();const value=await response.json();setRows(value.data.items);};
  useEffect(()=>{let active=true;fetch("/api/admin/research",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(value=>{if(active){setRows(value.data.items);setNotice("");}}).catch(()=>{if(active)setNotice(t.unavailable);});return()=>{active=false;};},[t.unavailable]);
  function install(bundle:{release:ResearchRelease;results:ResearchResults;documents:Record<string,string>},revision:number|null) {
    const nextBodies=Object.fromEntries(RESEARCH_DOCUMENTS.map(name=>[name,researchBody(bundle.documents[name],bundle.release,name)]));
    setRelease(bundle.release);setMetadata(JSON.stringify(bundle.release,null,2));setResultsText(JSON.stringify(bundle.results,null,2));setBodies(nextBodies);setExpected(revision);setNotice("");
  }
  function invalidateReviews() {
    setRelease({...release,state:"draft",reviews:Object.fromEntries(Object.keys(release.reviews).map(key=>[key,false]))});
  }
  async function load(row:IndexRow) {
    if(pending.current||lock.current){setNotice(t.pending);return;}
    setBusy(true);lock.current=true;setNotice(t.loading);
    try{const response=await fetch(`/api/admin/research?${new URLSearchParams({slug:row.slug,version:row.version})}`,{cache:"no-store"});if(!response.ok)throw new Error();const bundle=(await response.json()).data;install(bundle,bundle.release.revision);}
    catch{setNotice(t.unavailable);}finally{setBusy(false);lock.current=false;}
  }
  async function save(state:string,retry=false) {
    if(lock.current)return;lock.current=true;setBusy(true);
    try {
      if(pending.current&&!retry){setNotice(t.pending);return;}
      if(!pending.current) {
        const next:ResearchRelease=JSON.parse(metadata);const results:ResearchResults=JSON.parse(resultsText);
        next.state=state;next.reviews=release.reviews;
        next.results_sha256=await digest(canonicalResearch(results));
        const documents=Object.fromEntries(RESEARCH_DOCUMENTS.map(name=>[name,researchTemplate(next,name)+bodies[name]]));
        next.files=Object.fromEntries(await Promise.all(RESEARCH_DOCUMENTS.map(async name=>[name,await digest(documents[name])])));
        pending.current={key:crypto.randomUUID(),body:JSON.stringify({release:next,results,documents,expected_revision:expected})};
      }
      const csrfResponse=await fetch("/api/auth/csrf",{cache:"no-store"});if(!csrfResponse.ok)throw new Error();
      const csrf=await csrfResponse.json();
      const response=await fetch("/api/admin/research",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrf.data.csrf_token,"idempotency-key":pending.current.key},body:pending.current.body});
      const value=await response.json();
      if(!response.ok) {
        if(!value.error.retryable&&response.status!==401&&response.status!==403)pending.current=null;
        const fields=Object.keys(value.error.field_errors??{}).join(", ");
        setNotice((value.error.message_key==="research.invalid"?t.invalid:t.network)+(fields?` (${fields})`:""));return;
      }
      const sent=JSON.parse(pending.current.body);pending.current=null;
      install({...sent,release:value.data.release},value.data.revision);setNotice(t.saved);
      try{await reload();}catch{/* Storage is confirmed even if the subsequent list read fails. */}
    } catch{setNotice(pending.current?t.network:t.invalid);}finally{lock.current=false;setBusy(false);}
  }
  let previewBody:string;
  try{previewBody=renderResearchMetrics(bodies[file],JSON.parse(resultsText));}catch{previewBody=t.invalid;}
  const canEdit=["draft","in_review","ready"].includes(release.state);
  return <main lang={locale} className="mx-auto max-w-6xl px-4 py-5 font-[system-ui] text-base leading-6 text-[#18302d] sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c8d6d0] pb-3"><h1 className="m-0 text-2xl font-semibold">{t.editor}</h1><nav className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/admin`}>{messages[locale].public.observations}</Link><Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research`}>{messages[locale].public.research}</Link></nav></header>
    <p className="my-3 rounded border border-[#c9b98a] bg-[#f4f1e8] p-3">{t.publicDraft}</p>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside><h2 className="mb-2 text-lg font-semibold">{t.drafts}</h2><button disabled={busy||Boolean(pending.current)} className="min-h-11 text-[#155f53] underline disabled:opacity-60" onClick={()=>{const next=makeRelease();setRelease(next);setMetadata(JSON.stringify(next,null,2));setResultsText(JSON.stringify(seedResults,null,2));setBodies(Object.fromEntries(RESEARCH_DOCUMENTS.map(name=>[name,""])));setExpected(null);setNotice("");}}>{t.new}</button>
      {rows.map(row=><button key={`${row.slug}/${row.version}`} disabled={busy||Boolean(pending.current)} onClick={()=>load(row)} className="block min-h-11 w-full break-words border-b border-[#c8d6d0] py-3 text-left text-sm">{row.slug}<br/>{row.version} · {t.states[row.state as keyof typeof t.states]}</button>)}</aside>
      <section className="grid min-w-0 gap-3">
        <label className="grid gap-2">{t.import}<input type="file" accept="application/json,.json" disabled={busy||Boolean(pending.current)} className={controlClass} onChange={async event=>{try{const selected=event.target.files?.[0];if(!selected||selected.size>600_000)throw new Error();const bundle=JSON.parse(await selected.text());install(bundle,null);}catch{setNotice(t.invalid);}}}/></label>
        <details className="rounded border border-[#c8d6d0] p-3" open><summary className="min-h-11 font-semibold">{t.metadata}</summary><label className="grid gap-2"><span>{t.changeReason}</span><textarea aria-label={t.metadata} value={metadata} disabled={busy||Boolean(pending.current)||!canEdit} onChange={event=>{invalidateReviews();setMetadata(event.target.value);}} className={`${controlClass} min-h-64 font-mono text-base`}/></label></details>
        {!canEdit&&<label className="grid gap-2">{t.changeReason}<textarea disabled={busy||Boolean(pending.current)} className={controlClass} value={JSON.parse(metadata).change_reason} onChange={event=>{const value=JSON.parse(metadata);value.change_reason=event.target.value;setMetadata(JSON.stringify(value,null,2));}}/></label>}
        <details className="rounded border border-[#c8d6d0] p-3"><summary className="min-h-11 font-semibold">{t.results}</summary><textarea aria-label={t.results} value={resultsText} disabled={busy||Boolean(pending.current)||!canEdit} onChange={event=>{invalidateReviews();setResultsText(event.target.value);}} className={`${controlClass} min-h-64 font-mono text-base`}/></details>
        <h2 className="m-0 text-lg font-semibold">{t.documents}</h2><div className="flex flex-wrap gap-2">{RESEARCH_DOCUMENTS.map(name=><button key={name} aria-pressed={name===file} onClick={()=>setFile(name)} className="min-h-11 rounded border border-[#9aafa7] px-3 aria-pressed:bg-[#edf3f0] active:translate-y-px">{t.documentLabels[name as keyof typeof t.documentLabels]}</button>)}</div>
        <p className="m-0 text-sm">{t.bodyOnly}</p><textarea aria-label={t.documentLabels[file as keyof typeof t.documentLabels]} disabled={busy||Boolean(pending.current)||!canEdit} value={bodies[file]} onChange={event=>{invalidateReviews();setBodies({...bodies,[file]:event.target.value});}} className={`${controlClass} min-h-80 resize-y`}/>
        <button aria-expanded={preview} onClick={()=>setPreview(!preview)} className="min-h-11 justify-self-start text-[#155f53] underline">{t.preview}</button>{preview&&<div className="max-w-[80ch] rounded border border-[#c8d6d0] px-4"><ResearchMarkdown body={previewBody}/>{(()=>{try{return <ResearchResultsView results={JSON.parse(resultsText)} locale={locale}/>;}catch{return null;}})()}</div>}
        <fieldset disabled={busy||Boolean(pending.current)||!canEdit} className="grid gap-2"><legend className="font-semibold">{t.reviews}</legend>{Object.entries(t.reviewLabels).map(([key,label])=><label key={key} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={release.reviews[key]} onChange={event=>setRelease({...release,reviews:{...release.reviews,[key]:event.target.checked}})} className="size-5 accent-[#145f53]"/>{label}</label>)}</fieldset>
        <div className="sticky bottom-0 grid gap-2 border-t border-[#c8d6d0] bg-white py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <p role="status" className="m-0 break-words">{notice}</p>
          <div className="flex flex-wrap gap-2">{pending.current?<button disabled={busy} className={primaryButtonClass} onClick={()=>save(release.state,true)}>{t.retry}</button>:<>{canEdit&&<button disabled={busy} className={primaryButtonClass} onClick={()=>save("draft")}>{t.save}</button>}{(["in_review","ready","published"] as const).filter(state=>state==="in_review"?canEdit:state==="ready"?release.state==="in_review"||release.state==="ready":release.state==="ready").map(state=><button key={state} disabled={busy} className="min-h-11 rounded border border-[#145f53] px-3 text-[#155f53] active:translate-y-px" onClick={()=>save(state)}>{state==="in_review"?t.review:state==="ready"?t.ready:t.publish}</button>)}{release.state==="published"&&<button disabled={busy} className={primaryButtonClass} onClick={()=>save("withdrawn")}>{t.withdraw}</button>}</>}</div>
        </div>
      </section>
    </div>
  </main>;
}
