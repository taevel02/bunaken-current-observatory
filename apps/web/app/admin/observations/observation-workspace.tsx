"use client";

import { FormEvent, useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { resolveSiteId, sites } from "@bunaken/contracts/sites";

type Locale = "ko" | "en";
// Dynamic public JSON revision shapes are validated at the API boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const DB = "bunaken-observation-drafts";
const STORE = "drafts";
const uuid = () => crypto.randomUUID();
const ui = {
  shell: "mx-auto box-border w-full max-w-6xl px-[18px] pb-16 pt-6 text-base leading-6 text-[#18302d] [font-family:system-ui,sans-serif] max-[680px]:px-4 max-[680px]:pt-[18px] max-[360px]:px-3",
  header: "flex items-start justify-between gap-4 border-b border-[#c8d6d0] pb-5 max-[680px]:items-center max-[360px]:block",
  eyebrow: "my-1.5 text-xs tracking-[.14em] text-[#54736a]",
  title: "my-1 text-[clamp(1.8rem,6vw,2.5rem)] tracking-[-.04em]",
  logout: "min-h-11 px-2.5 font-[inherit] text-[#155f53] active:translate-y-px max-[680px]:whitespace-nowrap max-[360px]:inline-block max-[360px]:pl-0",
  lang: "my-3.5 flex gap-5",
  langLink: "inline-flex min-h-11 items-center text-[#155f53] aria-[current=page]:font-bold aria-[current=page]:underline-offset-4",
  layout: "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)] items-start gap-8 max-[680px]:grid-cols-1 max-[680px]:gap-7",
  form: "min-w-0 [&>h2]:my-3 [&>h2]:mb-[18px] [&_small]:my-1.5 [&_small]:block [&_small]:text-sm [&_small]:text-[#49625c] [&_input:not([type=checkbox])]:box-border [&_input:not([type=checkbox])]:min-h-12 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:min-w-0 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-[#9aafa7] [&_input:not([type=checkbox])]:bg-white [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:py-2.5 [&_input:not([type=checkbox])]:font-[inherit] [&_input:not([type=checkbox])]:text-base [&_input:not([type=checkbox])]:text-[#18302d] [&_select]:box-border [&_select]:min-h-12 [&_select]:w-full [&_select]:min-w-0 [&_select]:rounded-md [&_select]:border [&_select]:border-[#9aafa7] [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:font-[inherit] [&_select]:text-base [&_select]:text-[#18302d] [&_textarea]:box-border [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[#9aafa7] [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:font-[inherit] [&_textarea]:text-base [&_textarea]:text-[#18302d] [&_input:focus-visible]:outline-3 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[#72b7a5] [&_select:focus-visible]:outline-3 [&_select:focus-visible]:outline-offset-2 [&_select:focus-visible]:outline-[#72b7a5] [&_textarea:focus-visible]:outline-3 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[#72b7a5] [&_details]:my-3.5",
  records: "min-w-0 max-[680px]:border-t max-[680px]:border-[#c8d6d0] max-[680px]:pt-2.5",
  sectionTitle: "my-3 text-xl",
  fields: "m-0 min-w-0 border-0 p-0",
  requiredSection: "min-w-0 rounded-lg border border-l-4 border-[#9aafa7] border-l-[#145f53] bg-[#f7faf8] p-4",
  sectionHeading: "m-0 flex flex-wrap items-center gap-2.5 text-[1.08rem]",
  requiredTag: "inline-flex w-max items-center rounded-full bg-[#145f53] px-2 py-0.5 text-xs font-bold leading-6 text-white",
  optionalTag: "inline-flex shrink-0 items-center rounded-full bg-[#e8efec] px-2 py-0.5 text-xs font-bold leading-6 text-[#405a53]",
  help: "my-1 block text-sm text-[#49625c]",
  fieldLabel: "my-3.5 grid min-w-0 gap-1.5 font-semibold",
  control: "box-border min-h-12 w-full min-w-0 rounded-md border border-[#9aafa7] bg-white px-3 py-2.5 font-[inherit] text-base text-[#18302d] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#72b7a5]",
  textarea: "box-border min-h-24 w-full min-w-0 resize-y rounded-md border border-[#9aafa7] bg-white px-3 py-2.5 font-[inherit] text-base text-[#18302d] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#72b7a5]",
  check: "my-3 flex min-h-11 min-w-0 items-center gap-3",
  checkbox: "size-5 shrink-0 accent-[#145f53]",
  optionalGroup: "my-3.5 min-w-0 border-b border-[#c8d6d0] py-3 [&[open]]:pb-[18px]",
  summary: "flex min-h-11 min-w-0 flex-wrap items-center gap-2.5 py-1 font-semibold [&::marker]:text-[#145f53]",
  optionalContent: "min-w-0 pt-1",
  timePair: "grid min-w-0 grid-cols-1 items-start gap-x-3 sm:grid-cols-2",
  sample: "my-3.5 min-w-0 rounded-md border border-[#c8d6d0] px-3 py-2.5 [&_legend]:px-1 [&_legend]:font-semibold",
  finePrint: "my-1.5 block text-sm text-[#49625c]",
  button: "my-1.5 mr-1 min-h-12 rounded-md border border-[#145f53] bg-white px-4 py-2.5 font-[inherit] font-semibold text-[#145f53] active:translate-y-px disabled:opacity-60",
  primary: "mt-2 min-h-12 w-full rounded-md border-0 bg-[#145f53] px-4 py-2.5 font-[inherit] font-semibold text-white active:translate-y-px disabled:opacity-60",
  formActions: "sticky bottom-0 z-10 mx-[-8px] mt-3 border-t border-[#c8d6d0] bg-white px-2 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]",
  notice: "border-l-[3px] border-[#9b7d39] bg-[#f4f1e8] p-3",
  record: "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-0 border-b border-[#c8d6d0] bg-transparent px-1 py-3.5 text-left font-[inherit] text-inherit [&_span:last-child]:col-span-full [&_span:last-child]:text-sm [&_span:last-child]:text-[#55716a]",
  detail: "mt-5 min-w-0 border-t-2 border-[#145f53] pt-3.5 [&_p]:[overflow-wrap:anywhere] [&_h3]:my-2 [&_button]:min-h-11 [&_label]:my-3 [&_label]:grid [&_label]:min-w-0 [&_label]:gap-1.5 [&_label]:font-semibold [&_input:not([type=checkbox])]:box-border [&_input:not([type=checkbox])]:min-h-12 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:min-w-0 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-[#9aafa7] [&_input:not([type=checkbox])]:bg-white [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:py-2.5 [&_input:not([type=checkbox])]:font-[inherit] [&_input:not([type=checkbox])]:text-base [&_input:not([type=checkbox])]:text-[#18302d] [&_select]:box-border [&_select]:min-h-12 [&_select]:w-full [&_select]:min-w-0 [&_select]:rounded-md [&_select]:border [&_select]:border-[#9aafa7] [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:font-[inherit] [&_select]:text-base [&_select]:text-[#18302d] [&_textarea]:box-border [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[#9aafa7] [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:font-[inherit] [&_textarea]:text-base [&_textarea]:text-[#18302d] [&_input:focus-visible]:outline-3 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[#72b7a5] [&_select:focus-visible]:outline-3 [&_select:focus-visible]:outline-offset-2 [&_select:focus-visible]:outline-[#72b7a5] [&_textarea:focus-visible]:outline-3 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[#72b7a5]",
  close: "float-right min-h-11",
};
function hasPeakDetails(event: Row) {
  const hasValue = (value: unknown) => typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
  return Boolean(
    hasValue(event.local_at) || hasValue(event.at) || hasValue(event.zone_id) || hasValue(event.duration_description) || hasValue(event.context_description) ||
    hasValue(event.pci) || hasValue(event.depth_m) ||
    (event.vertical_direction && event.vertical_direction !== "unknown") ||
    hasValue(event.vertical_intensity),
  );
}
const siteLabel = (id: string, locale: Locale) => {
  const site = sites.find((candidate) => candidate.id === resolveSiteId(id));
  if (!site) return id;
  return locale === "ko" ? site.name_ko : site.name_en;
};
const utcToWitaLocal = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(" ", "T");
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function draft(action: "put" | "all" | "delete" | "clear", value?: Row) {
  const db = await database();
  // IndexedDB returns either a request result or no value for write actions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE, action === "all" ? "readonly" : "readwrite");
    const store = tx.objectStore(STORE);
    const req = action === "put" ? store.put(value) : action === "all" ? store.getAll() : action === "delete" ? store.delete(value?.id) : store.clear();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export function ObservationWorkspace({ locale: initialLocale, observerAlias }: { locale: Locale; observerAlias: string | null }) {
  const [locale, setLocale] = useState(initialLocale);
  const c = messages[locale];
  const t = c.observations as Record<string, string>;
  const [rows, setRows] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<Row | null>(null);
  const [id, setId] = useState(uuid());
  const [key, setKey] = useState(uuid());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [restore, setRestore] = useState<Row[]>([]);
  const [draftPayload, setDraftPayload] = useState<Row | null>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [peakId, setPeakId] = useState(uuid());
  const [correctionPCI, setCorrectionPCI] = useState(0);
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [conflictPair, setConflictPair] = useState<{ old: Row; latest: Row } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{ id: string; key: string; payload: Row } | null>(null);
  const [pendingMutation, setPendingMutation] = useState<{ id: string; action: "correct" | "withdraw"; key: string; reason: string; pci: number; notes: string; etag: string; record: Row; public_summary_ko: unknown; public_summary_en: unknown } | null>(null);
  const [alias, setAlias] = useState(observerAlias);

  async function load(cursor: string | null = null, append = false) {
    try {
      const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const r = await fetch(`/api/admin/observations?limit=50${query}`, { cache: "no-store" });
      if (!r.ok) throw new Error(t.listError);
      const page = (await r.json()).data;
      setRows((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.next_cursor);
    } catch { setMessage(t.listError); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { void fetch("/api/admin/session", { cache: "no-store" }).then(async (response) => { if (response.ok) setAlias((await response.json()).data.observer_alias); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!consent) return;
    let active = true;
    setDraftsLoaded(false);
    void draft("all").then((all: Row[]) => {
      if (!active) return;
      const now = Date.now();
      const valid = all.filter((item) => now - item.savedAt < 7 * 86400000);
      for (const item of all) if (!valid.includes(item)) void draft("delete", item);
      setRestore(valid);
      setDraftsLoaded(true);
    }).catch(() => { if (active) setMessage(t.draftUnavailable); });
    return () => { active = false; };
  }, [consent]);
  useEffect(() => {
    const syncLocale = () => {
      const pathLocale = window.location.pathname.split("/")[1];
      if (pathLocale === "ko" || pathLocale === "en") setLocale(pathLocale);
    };
    window.addEventListener("popstate", syncLocale);
    return () => window.removeEventListener("popstate", syncLocale);
  }, []);

  function switchLocale(next: Locale) {
    window.history.pushState(null, "", `/${next}/admin`);
    setLocale(next);
  }

  function buildPayload(form: FormData): Row {
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const num = (name: string) => value(name) === "" ? null : Number(value(name));
    const local = (name: string) => value(name) || null;
    const verticalOnsetTime = local("vertical_onset_at");
    const verticalOnsetDepth = num("vertical_onset_depth");
    const verticalOnset = verticalOnsetTime || verticalOnsetDepth !== null
      ? { local_at: verticalOnsetTime, at: null, depth_m: verticalOnsetDepth }
      : null;
    return {
      id, local_start: local("local_start"), local_end: local("local_end"), timezone: "Asia/Makassar", time_precision: String(form.get("time_precision")),
      site_id: value("site_id"), zone_id: value("zone_id") || null, route_description: value("route_description"), representative_depth_m: num("representative_depth_m"),
      overall_pci: num("overall_pci"), vertical: { direction: String(form.get("direction")), intensity: num("intensity") }, vertical_onset: verticalOnset,
      confidence: String(form.get("confidence")), peak_events: (() => {
        const event = { id: peakId, local_at: local("peak_at"), at: null, depth_m: num("peak_depth"), zone_id: value("peak_zone") || null, pci: num("peak_pci"), duration_description: value("peak_duration") || null, context_description: value("peak_context") || null, vertical_direction: String(form.get("peak_direction")), vertical_intensity: num("peak_intensity") };
        return hasPeakDetails(event) ? [event] : [];
      })(),
      observed_temperature: value("temperature") === "" ? null : { celsius: num("temperature"), depth_m: null, at: null },
      notes_public: value("notes_public"), use_for_model: form.get("use_for_model") === "on",
    };
  }

  function preserveDraft(form: HTMLFormElement, explicitConsent = false) {
    if ((!consent && !explicitConsent) || !draftsLoaded || (restore.some((item) => item.id === "active") && !draftPayload)) return;
    void draft("put", { id: "active", payload: buildPayload(new FormData(form)), key, savedAt: Date.now() }).catch(() => setMessage(t.draftUnavailable));
  }

  function updateCorrection(field: string, value: unknown) {
    setCorrectionDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateCorrectionVertical(field: string, value: unknown) {
    setCorrectionDraft((current) => current ? { ...current, vertical: { ...current.vertical, [field]: value } } : current);
  }

  function updateCorrectionPeak(eventIndex: number, field: string, value: unknown) {
    setCorrectionDraft((current) => {
      if (!current) return current;
      const peakEvents = current.peak_events ?? [];
      return {
        ...current,
        peak_events: peakEvents.map((event: Row, index: number) => {
          if (index !== eventIndex) return event;
          return { ...event, [field]: value, ...(field === "local_at" ? { at: null } : {}) };
        }),
      };
    });
  }

  function updateCorrectionTemperature(value: string) {
    setCorrectionDraft((current) => current ? { ...current, observed_temperature: value === "" ? null : { ...(current.observed_temperature ?? { depth_m: null, at: null }), celsius: value } } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (consent && (!draftsLoaded || (restore.some((item) => item.id === "active") && !draftPayload))) { setMessage(t.restoreManual); return; }
    const form = new FormData(event.currentTarget);
    const payload = pendingCreate?.id === id && pendingCreate.key === key ? pendingCreate.payload : buildPayload(form);
    if (payload.local_end && payload.local_end <= payload.local_start) { setMessage(t.endBeforeStart); return; }
    if ((payload.peak_events ?? []).some((event: Row) => event.pci !== null && event.pci < payload.overall_pci)) { setMessage(t.peakBelowOverall); return; }
    setBusy(true); setMessage(t.saving);
    setPendingCreate({ id, key, payload });
    if (consent) await draft("put", { id: "active", payload, key, pendingCreate: true, savedAt: Date.now() }).catch(() => undefined);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (csrfResponse.status === 401) throw new Error("SESSION");
      if (!csrfResponse.ok) throw new Error(t.saveError);
      const csrf = (await csrfResponse.json()).data.csrf_token;
      let response: Response;
      try {
        response = await fetch("/api/admin/observations", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": key }, body: JSON.stringify(payload) });
      } catch {
        const status = await fetch("/api/admin/requests/status", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ idempotency_key: key }) });
        if (!status.ok) throw new Error(t.saveError);
        const result = (await status.json()).data;
        if (!result.found) throw new Error(t.retrySame);
        response = new Response(JSON.stringify({ data: result }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (response.status === 401) throw new Error("SESSION");
      if (!response.ok) {
        const err = await response.json();
        if ([400, 401, 403, 422].includes(response.status)) {
          setPendingCreate(null);
          if (consent) await draft("put", { id: "active", payload, key, pendingCreate: false, savedAt: Date.now() }).catch(() => undefined);
        }
        if (err.error.code === "revision_conflict") throw new Error(t.conflict);
        if (err.error.code === "idempotency_conflict") throw new Error(c.errors.idempotencyConflict);
        throw new Error(err.error.message_key === "errors.storageUnavailable" ? t.saveError : t.invalid);
      }
    setMessage(t.saved); setPendingCreate(null); await draft("delete", { id: "active" }).catch(() => undefined); setRestore([]); setDraftPayload(null); setId(uuid()); setKey(uuid()); setPeakId(uuid()); setFormEpoch((value) => value + 1); (event.currentTarget as HTMLFormElement).reset(); await load();
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION") {
        setSessionExpired(true);
        setMessage(t.session);
      } else setMessage(error instanceof Error ? error.message : t.saveError);
    } finally { setBusy(false); }
  }

  async function openRow(row: Row) {
    const response = await fetch(`/api/admin/observations/${row.id}`, { cache: "no-store" });
    if (response.ok) { const data = { ...(await response.json()).data, etag: response.headers.get("etag") }; setSelected(data); setCorrectionDraft(data); setCorrectionPCI(data.overall_pci); setCorrectionNotes(data.notes_public ?? ""); setConflictPair(null); }
    else setMessage(t.listError);
  }

  async function mutateSelected(action: "correct" | "withdraw") {
    if (!selected || !correctionDraft) return;
    if (action === "correct" && (correctionDraft.peak_events ?? []).some((event: Row) => !hasPeakDetails(event))) { setMessage(t.peakDetailsRequired); return; }
    if (action === "correct" && correctionDraft.local_end && correctionDraft.local_end <= correctionDraft.local_start) { setMessage(t.endBeforeStart); return; }
    if (action === "correct" && (correctionDraft.peak_events ?? []).some((event: Row) => event.pci !== null && event.pci !== "" && Number(event.pci) < correctionPCI)) { setMessage(t.peakBelowOverall); return; }
    let pending = pendingMutation;
    if (!pending || pending.id !== selected.id || pending.action !== action) {
      const reason = window.prompt(t.reasonPrompt);
      if (!reason?.trim()) return;
      pending = { id: selected.id, action, key: uuid(), reason: reason.trim(), pci: correctionPCI, notes: correctionNotes, etag: selected.etag, record: correctionDraft, public_summary_ko: selected.public_summary_ko, public_summary_en: selected.public_summary_en };
      setPendingMutation(pending);
      if (consent) await draft("put", { id: "pending-mutation", pendingMutation: pending, savedAt: Date.now() }).catch(() => setMessage(t.draftUnavailable));
    }
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (csrfResponse.status === 401) throw new Error("SESSION");
      if (!csrfResponse.ok) throw new Error(t.saveError);
      const csrf = (await csrfResponse.json()).data.csrf_token;
      const headers = { "content-type": "application/json", "x-csrf-token": csrf, "if-match": pending.etag, "idempotency-key": pending.key };
      const body = action === "withdraw" ? { reason: pending.reason } : {
        id: selected.id, local_start: pending.record.local_start, local_end: pending.record.local_end, timezone: pending.record.timezone, time_precision: pending.record.time_precision,
        site_id: pending.record.site_id, zone_id: pending.record.zone_id || null, route_description: pending.record.route_description ?? "", representative_depth_m: pending.record.representative_depth_m === "" || pending.record.representative_depth_m === null ? null : Number(pending.record.representative_depth_m),
        overall_pci: pending.pci, vertical: { direction: pending.record.vertical.direction, intensity: pending.record.vertical.intensity === "" || pending.record.vertical.intensity === null ? null : Number(pending.record.vertical.intensity) },
        vertical_onset: pending.record.vertical_onset ? { ...pending.record.vertical_onset, at: null } : null,
        confidence: pending.record.confidence,
        peak_events: (pending.record.peak_events ?? []).map((item: Row) => ({ ...item, local_at: item.local_at !== undefined ? item.local_at : (item.at ? utcToWitaLocal(item.at) : null), at: null, pci: item.pci === "" || item.pci === null ? null : Number(item.pci), depth_m: item.depth_m === "" || item.depth_m === null || item.depth_m === undefined ? null : Number(item.depth_m), vertical_intensity: item.vertical_intensity === "" || item.vertical_intensity === null || item.vertical_intensity === undefined ? null : Number(item.vertical_intensity), zone_id: typeof item.zone_id === "string" ? item.zone_id.trim() || null : null, duration_description: typeof item.duration_description === "string" ? item.duration_description.trim() || null : null, context_description: typeof item.context_description === "string" ? item.context_description.trim() || null : null })),
        ...(Array.isArray(pending.record.time_samples) ? { time_samples: pending.record.time_samples.map((sample: Row) => ({ id: sample.id, local_at: sample.local_at, at: null, zone_id: sample.zone_id || null, depth_m: sample.depth_m === "" || sample.depth_m === null ? null : Number(sample.depth_m), temperature_c: sample.temperature_c === "" || sample.temperature_c === null ? null : Number(sample.temperature_c), perceived_pci: sample.perceived_pci === "" || sample.perceived_pci === null ? null : Number(sample.perceived_pci), horizontal_direction: sample.horizontal_direction || "unknown" })) } : {}),
        observed_temperature: pending.record.observed_temperature ? { ...pending.record.observed_temperature, celsius: pending.record.observed_temperature.celsius === "" || pending.record.observed_temperature.celsius === null ? null : Number(pending.record.observed_temperature.celsius) } : null, notes_public: pending.notes, public_summary_ko: pending.public_summary_ko,
        public_summary_en: pending.public_summary_en, use_for_model: pending.record.use_for_model, correction_reason: pending.reason,
      };
      let response: Response;
      const status = await fetch("/api/admin/requests/status", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ idempotency_key: pending.key }) });
      if (status.status === 401) throw new Error("SESSION");
      if (!status.ok) throw new Error(t.retrySame);
      const committed = (await status.json()).data.found;
      if (committed) {
        response = new Response(null, { status: 200 });
      } else {
        try {
          response = await fetch(action === "withdraw" ? `/api/admin/observations/${selected.id}/withdraw` : `/api/admin/observations/${selected.id}`, {
            method: action === "withdraw" ? "POST" : "PATCH", headers, body: JSON.stringify(body),
          });
        } catch {
          const retryStatus = await fetch("/api/admin/requests/status", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ idempotency_key: pending.key }) });
          if (!retryStatus.ok) throw new Error(t.retrySame);
          if (!(await retryStatus.json()).data.found) throw new Error(t.retrySame);
          response = new Response(null, { status: 200 });
        }
      }
      if (response.status === 401) throw new Error("SESSION");
      if (response.status === 409) {
        const latest = await fetch(`/api/admin/observations/${selected.id}`, { cache: "no-store" });
        if (latest.ok) { const data = { ...(await latest.json()).data, etag: latest.headers.get("etag") }; setConflictPair({ old: selected, latest: data }); setSelected(data); setCorrectionDraft(data); }
        setPendingMutation(null);
        await draft("delete", { id: "pending-mutation" }).catch(() => undefined);
        setMessage(t.conflict);
        return;
      }
      if ([400, 413, 415, 422].includes(response.status)) {
        setPendingMutation(null);
        await draft("delete", { id: "pending-mutation" }).catch(() => undefined);
        setMessage(t.invalid);
        return;
      }
      if (!response.ok) throw new Error(t.saveError);
      setPendingMutation(null);
      await draft("delete", { id: "pending-mutation" }).catch(() => undefined);
      setMessage(action === "withdraw" ? t.withdrawn : t.corrected);
      await load();
      await openRow(selected);
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION") { setSessionExpired(true); setMessage(t.session); }
      else setMessage(error instanceof Error ? error.message : t.saveError);
    }
  }

  const draftVertical = draftPayload?.vertical as Row | undefined;
  const draftPeaks = draftPayload?.peak_events as Row[] | undefined;
  const showDiveDetails = Boolean(draftPayload?.local_end || draftPayload?.zone_id || draftPayload?.route_description || draftPayload?.representative_depth_m != null || draftPayload?.time_precision === "approximate");
  const showVerticalDetails = Boolean((draftVertical?.direction && draftVertical.direction !== "unknown") || draftVertical?.intensity != null || draftPayload?.vertical_onset || draftPayload?.confidence === "high" || draftPayload?.confidence === "low");
  const showPeakDetails = Boolean(draftPeaks?.length || draftPayload?.notes_public || (draftPayload?.observed_temperature as Row | null | undefined)?.celsius != null);

  return <main className={ui.shell} lang={locale}>
    <header className={ui.header}><div className="min-w-0"><p className={ui.eyebrow}>BUNAKEN · {alias ?? "ADMIN"}</p><h1 className={ui.title}>{t.title}</h1><p className="my-1.5">{t.publicWarning}</p></div><button className={ui.logout} onClick={async () => { await draft("clear").catch(() => undefined); try { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) { window.location.assign(`/${locale}/admin/login`); return; } const csrf = (await response.json()).data.csrf_token; const result = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } }); if (result.ok) window.location.assign(`/${locale}/admin/login`); else setMessage(t.logoutError); } catch { setMessage(t.logoutError); } }}>{t.logout}</button></header>
    <nav className={ui.lang}><a className={ui.langLink} href="/ko/admin" aria-current={locale === "ko" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("ko"); }}>한국어</a><a className={ui.langLink} href="/en/admin" aria-current={locale === "en" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("en"); }}>English</a></nav>
    <section className={ui.layout}>
      <form className={ui.form} key={formEpoch} onSubmit={save} onChange={(event) => { if ((event.nativeEvent.target as HTMLInputElement).name !== "draft_consent") preserveDraft(event.currentTarget); }}>
        <h2 className={ui.sectionTitle}>{t.newRecord}</h2>
        <fieldset disabled={busy || Boolean(pendingCreate)} className={ui.fields}>
        <section className={ui.requiredSection} aria-labelledby="required-heading">
          <h3 className={ui.sectionHeading} id="required-heading">{t.requiredFieldsHeading}</h3>
          <p className={ui.help}>{t.requiredFieldsHelp}</p>
          <label className={ui.fieldLabel}><span className="flex flex-wrap items-center gap-2">{t.dateTime}<b className={ui.requiredTag}>{t.required}</b></span><input name="local_start" type="datetime-local" defaultValue={(draftPayload?.local_start as string | undefined) ?? ""} required /></label>
          <label className={ui.fieldLabel}><span className="flex flex-wrap items-center gap-2">{t.site}<b className={ui.requiredTag}>{t.required}</b></span><select name="site_id" required defaultValue={resolveSiteId(draftPayload?.site_id) ?? ""}><option value="" disabled>{t.sitePlaceholder}</option>{sites.map((site) => <option key={site.id} value={site.id}>{locale === "ko" ? site.name_ko : site.name_en}</option>)}</select></label>
          <label className={ui.fieldLabel}><span className="flex flex-wrap items-center gap-2">{t.pci}<b className={ui.requiredTag}>{t.required}</b></span><input name="overall_pci" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={draftPayload?.overall_pci as number | undefined} /></label>
          <small>{t.pciHelp}</small>
        </section>
        <details className={ui.optionalGroup} open={showDiveDetails}>
          <summary className={ui.summary}>{t.optionalDiveDetails}<span className={ui.optionalTag}>{t.optional}</span></summary>
          <div className={ui.optionalContent}>
            <label className={ui.fieldLabel}>{t.endTime}<input name="local_end" type="datetime-local" defaultValue={(draftPayload?.local_end as string | null | undefined) ?? ""} /></label>
            <small>{t.wita}</small>
            <label className={ui.fieldLabel}>{t.timePrecision}<select name="time_precision" defaultValue={(draftPayload?.time_precision as string | undefined) ?? "reported_minute"}><option value="reported_minute">{t.minuteExact}</option><option value="approximate">{t.approximate}</option></select></label>
            <label className={ui.fieldLabel}>{t.zone}<input name="zone_id" autoComplete="off" placeholder={t.unknown} defaultValue={draftPayload?.zone_id ?? ""} /></label>
            <label className={ui.fieldLabel}>{t.routeDescription}<input name="route_description" maxLength={300} placeholder={t.routePlaceholder} defaultValue={draftPayload?.route_description ?? ""} /></label>
            <label className={ui.fieldLabel}>{t.representativeDepth}<input name="representative_depth_m" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={draftPayload?.representative_depth_m ?? ""} /></label>
            <small>{t.representativeDepthHelp}</small>
          </div>
        </details>
        <details className={ui.optionalGroup} open={showVerticalDetails}>
          <summary className={ui.summary}>{t.verticalDetails}<span className={ui.optionalTag}>{t.optional}</span></summary>
          <div className={ui.optionalContent}>
            <div className={ui.timePair}>
              <label className={ui.fieldLabel}>{t.vertical}<select name="direction" defaultValue={(draftPayload?.vertical as Row | undefined)?.direction as string ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
              <label className={ui.fieldLabel}>{t.intensity}<input name="intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={(draftPayload?.vertical as Row | undefined)?.intensity ?? ""} /></label>
              <label className={ui.fieldLabel}>{t.confidence}<select name="confidence" defaultValue={draftPayload?.confidence as string ?? "normal"}><option value="high">{t.high}</option><option value="normal">{t.normal}</option><option value="low">{t.low}</option></select></label>
            </div>
            <label className={ui.fieldLabel}>{t.verticalOnset}<input name="vertical_onset_at" type="datetime-local" defaultValue={(draftPayload?.vertical_onset as Row | null | undefined)?.local_at ?? ""} /></label>
            <label className={ui.fieldLabel}>{t.onsetDepth}<input name="vertical_onset_depth" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={(draftPayload?.vertical_onset as Row | null | undefined)?.depth_m ?? ""} /></label>
            <small>{t.verticalOnsetHelp}</small>
          </div>
        </details>
        <details className={ui.optionalGroup} open={showPeakDetails}>
          <summary className={ui.summary}>{t.peakAndNotes}<span className={ui.optionalTag}>{t.optional}</span></summary>
          <div className={ui.optionalContent}>
            <p className={ui.help}>{t.peakHelp}</p>
            <div className={ui.timePair}>
              <label className={ui.fieldLabel}>{t.peakTime}<input name="peak_at" type="datetime-local" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.local_at as string | undefined) ?? ""} /></label>
              <label className={ui.fieldLabel}>{t.peakPCI}<input name="peak_pci" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.pci ?? "") as number | string} /></label>
              <label className={ui.fieldLabel}>{t.peakDepth}<input name="peak_depth" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.depth_m ?? "") as number | string} /></label>
              <label className={ui.fieldLabel}>{t.peakZone}<input name="peak_zone" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.zone_id ?? "") as string} /></label>
            </div>
            <label className={ui.fieldLabel}>{t.peakDuration}<input name="peak_duration" maxLength={300} placeholder={t.peakDurationPlaceholder} defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.duration_description ?? "") as string} /></label>
            <label className={ui.fieldLabel}>{t.peakSituation}<textarea name="peak_context" maxLength={1000} rows={3} defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.context_description ?? "") as string} /></label>
            <small>{t.peakSituationHelp}</small>
            <div className={ui.timePair}>
              <label className={ui.fieldLabel}>{t.peakDirection}<select name="peak_direction" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_direction as string) ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
              <label className={ui.fieldLabel}>{t.peakIntensity}<input name="peak_intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_intensity ?? "") as number | string} /></label>
              <label className={ui.fieldLabel}>{t.temperature}<input name="temperature" type="number" inputMode="decimal" min="-3" max="45" step="0.1" defaultValue={(draftPayload?.observed_temperature as Row | null | undefined)?.celsius ?? ""} /></label>
            </div>
            <label className={ui.fieldLabel}>{t.notes}<textarea name="notes_public" maxLength={5000} rows={4} defaultValue={draftPayload?.notes_public as string | undefined} /></label>
            <small>{t.publicMemoHelp}</small>
          </div>
        </details>
        <label className={ui.check}><input name="use_for_model" type="checkbox" defaultChecked={draftPayload?.use_for_model !== false} /><span>{t.modelUse}<b className={ui.optionalTag}>{t.optional}</b></span></label>
        <label className={ui.check}><input name="draft_consent" type="checkbox" checked={consent} onChange={(event) => { const enabled = event.target.checked; setConsent(enabled); if (enabled) { setDraftsLoaded(false); setRestore([]); } else { setRestore([]); setDraftPayload(null); setDraftsLoaded(false); void draft("clear").catch(() => setMessage(t.draftUnavailable)); } }} /><span>{t.draftConsent}<b className={ui.optionalTag}>{t.optional}</b></span></label>
        {restore.some((x) => x.id === "active") && <button type="button" className={ui.button} onClick={() => { const item = restore.find((x) => x.id === "active"); if (!item) return; setDraftPayload(item.payload); setId(item.payload.id); setKey(item.key); if (item.pendingCreate) setPendingCreate({ id: item.payload.id, key: item.key, payload: item.payload }); const peak = (item.payload.peak_events as Row[] | undefined)?.[0]; setPeakId((peak?.id as string) ?? uuid()); setFormEpoch((value) => value + 1); setMessage(t.restoreManual); }}>{t.restoreDraft}</button>}
        {restore.some((x) => x.id === "pending-mutation") && <button type="button" className={ui.button} onClick={() => { const item = restore.find((x) => x.id === "pending-mutation"); if (!item?.pendingMutation) return; const pending = item.pendingMutation; setPendingMutation(pending); void fetch(`/api/admin/observations/${pending.id}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const data = { ...(await response.json()).data, etag: pending.etag }; setSelected(data); setCorrectionDraft(pending.record); setCorrectionPCI(pending.pci); setCorrectionNotes(pending.notes); }).catch(() => setMessage(t.listError)); }}>{t.retryMutation}</button>}
        </fieldset>
        <div className={ui.formActions}><p className={ui.notice}>{t.publicWarning}</p><button className={ui.primary} disabled={busy}>{busy ? t.saving : pendingCreate ? t.retryMutation : t.save}</button>{sessionExpired && <p><a target="_blank" rel="noreferrer" href={`/${locale}/admin/login?returnTo=${encodeURIComponent(`/${locale}/admin`)}&recover_draft=1`}>{t.relogin}</a></p>}<p role="status" aria-live="polite">{message}</p></div>
      </form>
      <section className={ui.records}><h2 className={ui.sectionTitle}>{t.records}</h2>{rows.length === 0 ? <p>{t.empty}</p> : rows.map((row) => <button className={ui.record} key={row.id} disabled={Boolean(pendingMutation)} onClick={() => void openRow(row)}><strong>{siteLabel(row.site_id, locale)}</strong><span>{row.local_start}</span><span>PCI {row.overall_pci} · rev {row.revision}</span></button>)}{nextCursor && <button className={ui.button} onClick={() => void load(nextCursor, true)}>{t.moreRecords}</button>}
        {selected && <article className={ui.detail}>
          <button className={ui.close} disabled={Boolean(pendingMutation)} onClick={() => setSelected(null)}>{t.close}</button>
          <h3>{siteLabel(selected.site_id, locale)}</h3>
          <p>{selected.local_start} · PCI {selected.overall_pci} · rev {selected.revision}</p>
          <fieldset className={ui.fields} disabled={Boolean(pendingMutation)}>
            <details><summary>{t.correctFields}</summary>
              <label>{t.dateTime}<input type="datetime-local" value={correctionDraft?.local_start ?? ""} onChange={(event) => updateCorrection("local_start", event.target.value)} /></label>
              <label>{t.timePrecision}<select value={correctionDraft?.time_precision ?? ""} onChange={(event) => updateCorrection("time_precision", event.target.value)}><option value="reported_minute">{t.minuteExact}</option><option value="approximate">{t.approximate}</option></select></label>
              <label>{t.site}<select value={resolveSiteId(correctionDraft?.site_id) ?? ""} onChange={(event) => updateCorrection("site_id", event.target.value)}><option value="" disabled>{t.sitePlaceholder}</option>{sites.map((site) => <option key={site.id} value={site.id}>{locale === "ko" ? site.name_ko : site.name_en}</option>)}</select></label>
              <label>{t.zone}<input value={correctionDraft?.zone_id ?? ""} onChange={(event) => updateCorrection("zone_id", event.target.value)} /></label>
              <label>{t.endTime}<input type="datetime-local" value={correctionDraft?.local_end ?? ""} onChange={(event) => updateCorrection("local_end", event.target.value || null)} /></label>
              <label>{t.routeDescription}<input maxLength={300} value={correctionDraft?.route_description ?? ""} onChange={(event) => updateCorrection("route_description", event.target.value)} /></label>
              <label>{t.representativeDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={correctionDraft?.representative_depth_m ?? ""} onChange={(event) => updateCorrection("representative_depth_m", event.target.value)} /></label>
              <label>{t.vertical}<select value={correctionDraft?.vertical?.direction ?? "unknown"} onChange={(event) => updateCorrectionVertical("direction", event.target.value)}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
              <label>{t.intensity}<input type="number" inputMode="decimal" min="0" step="0.01" value={correctionDraft?.vertical?.intensity ?? ""} onChange={(event) => updateCorrectionVertical("intensity", event.target.value)} /></label>
              <label>{t.confidence}<select value={correctionDraft?.confidence ?? "normal"} onChange={(event) => updateCorrection("confidence", event.target.value)}><option value="high">{t.high}</option><option value="normal">{t.normal}</option><option value="low">{t.low}</option></select></label>
              <label>{t.temperature}<input type="number" inputMode="decimal" min="-3" max="45" step="0.1" value={correctionDraft?.observed_temperature?.celsius ?? ""} onChange={(event) => updateCorrectionTemperature(event.target.value)} /></label>
              <fieldset className={ui.sample}><legend>{t.verticalOnset}</legend>
                <label>{t.onsetTime}<input type="datetime-local" value={correctionDraft?.vertical_onset?.local_at ?? ""} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, vertical_onset: event.target.value ? { ...(current.vertical_onset ?? { at: null, depth_m: null }), local_at: event.target.value } : null } : current)} /></label>
                <label>{t.onsetDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={correctionDraft?.vertical_onset?.depth_m ?? ""} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, vertical_onset: { ...(current.vertical_onset ?? { local_at: null, at: null }), depth_m: event.target.value === "" ? null : Number(event.target.value) } } : current)} /></label>
              </fieldset>
              {(correctionDraft?.peak_events ?? []).map((event: Row, index: number) => <fieldset className={ui.sample} key={event.id ?? index}><legend>{t.peak} {index + 1}</legend>
                <label>{t.peakTime}<input type="datetime-local" value={event.local_at ?? (event.at ? utcToWitaLocal(event.at) : "")} onChange={(input) => updateCorrectionPeak(index, "local_at", input.target.value || null)} /></label>
                <label>{t.peakPCI}<input type="number" inputMode="decimal" min="0" step="0.01" value={event.pci ?? ""} onChange={(input) => updateCorrectionPeak(index, "pci", input.target.value)} /></label>
                <label>{t.peakDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={event.depth_m ?? ""} onChange={(input) => updateCorrectionPeak(index, "depth_m", input.target.value)} /></label>
                <label>{t.peakZone}<input value={event.zone_id ?? ""} onChange={(input) => updateCorrectionPeak(index, "zone_id", input.target.value || null)} /></label>
                <label>{t.vertical}<select value={event.vertical_direction ?? "unknown"} onChange={(input) => updateCorrectionPeak(index, "vertical_direction", input.target.value)}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
                <label>{t.intensity}<input type="number" inputMode="decimal" min="0" step="0.01" value={event.vertical_intensity ?? ""} onChange={(input) => updateCorrectionPeak(index, "vertical_intensity", input.target.value)} /></label>
                <label>{t.peakDuration}<input maxLength={300} placeholder={t.peakDurationPlaceholder} value={event.duration_description ?? ""} onChange={(input) => updateCorrectionPeak(index, "duration_description", input.target.value)} /></label>
                <label>{t.peakSituation}<textarea maxLength={1000} rows={3} value={event.context_description ?? ""} onChange={(input) => updateCorrectionPeak(index, "context_description", input.target.value)} /></label>
                <button type="button" className={ui.button} onClick={() => setCorrectionDraft((current) => current ? { ...current, peak_events: (current.peak_events ?? []).filter((_: Row, i: number) => i !== index) } : current)}>{t.removePeak}</button>
              </fieldset>)}
              <button type="button" className={ui.button} disabled={(correctionDraft?.peak_events ?? []).length >= 20} onClick={() => setCorrectionDraft((current) => current ? { ...current, peak_events: [...(current.peak_events ?? []), { id: uuid(), local_at: null, at: null, pci: null, depth_m: null, zone_id: null, vertical_direction: "unknown", vertical_intensity: null, duration_description: null, context_description: null }] } : current)}>{t.addPeak}</button>
            </details>
            <label>{t.correctedPCI}<input type="number" inputMode="decimal" min="0" step="0.01" value={correctionPCI} onChange={(event) => setCorrectionPCI(Number(event.target.value))} /></label>
            <label>{t.notes}<textarea maxLength={5000} rows={4} value={correctionNotes} onChange={(event) => setCorrectionNotes(event.target.value)} /></label>
          </fieldset>
          <p>{t.historyWarning}</p>
          {selected.record_status !== "withdrawn" && <><button className={ui.button} disabled={Boolean(pendingMutation && (pendingMutation.id !== selected.id || pendingMutation.action !== "correct"))} onClick={() => void mutateSelected("correct")}>{pendingMutation?.action === "correct" && pendingMutation.id === selected.id ? t.retryMutation : t.correct}</button>
          <button className={ui.button} disabled={Boolean(pendingMutation && (pendingMutation.id !== selected.id || pendingMutation.action !== "withdraw"))} onClick={() => void mutateSelected("withdraw")}>{pendingMutation?.action === "withdraw" && pendingMutation.id === selected.id ? t.retryMutation : t.withdraw}</button></>}
          {conflictPair && <div className={ui.notice} role="alert"><strong>{t.conflict}</strong><p>{t.oldValue}: PCI {conflictPair.old.overall_pci}, rev {conflictPair.old.revision}</p><p>{t.newValue}: PCI {conflictPair.latest.overall_pci}, rev {conflictPair.latest.revision}</p></div>}
        </article>}
      </section>
    </section>
  </main>;
}
