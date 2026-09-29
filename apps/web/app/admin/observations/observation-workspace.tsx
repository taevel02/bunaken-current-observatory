"use client";

import { FormEvent, useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { resolveSiteId, sites } from "@bunaken/contracts/sites";
import styles from "./workspace.module.css";

type Locale = "ko" | "en";
// Dynamic public JSON revision shapes are validated at the API boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type SampleDraft = { id: string; date: string; time: string; zone: string; depth: string; temperature: string; pci: string; direction: string };
const DB = "bunaken-observation-drafts";
const STORE = "drafts";
const uuid = () => crypto.randomUUID();
function localAtForDive(startAt: string, time: string, dateOverride = "") {
  return `${dateOverride || startAt.slice(0, 10)}T${time}`;
}
const siteLabel = (id: string, locale: Locale) => {
  const site = sites.find((candidate) => candidate.id === resolveSiteId(id));
  return site ? locale === "ko" ? site.name_ko : site.name_en : id;
};
const witaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const utcToWitaLocal = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(" ", "T");
function sampleDrafts(samples: Row[] = []): SampleDraft[] {
  return samples.map((sample) => ({
    id: sample.id ?? uuid(), date: String(sample.local_at ?? "").slice(0, 10), time: String(sample.local_at ?? "").slice(11, 16), zone: sample.zone_id ?? "",
    depth: sample.depth_m == null ? "" : String(sample.depth_m),
    temperature: sample.temperature_c == null ? "" : String(sample.temperature_c),
    pci: sample.perceived_pci == null ? "" : String(sample.perceived_pci),
    direction: sample.horizontal_direction ?? "unknown",
  }));
}
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
  const [correctionSamples, setCorrectionSamples] = useState<SampleDraft[]>([]);
  const [sampleRows, setSampleRows] = useState<SampleDraft[]>([]);
  const [id, setId] = useState(uuid());
  const [key, setKey] = useState(uuid());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [restore, setRestore] = useState<Row[]>([]);
  const [draftPayload, setDraftPayload] = useState<Row | null>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [peakEnabled, setPeakEnabled] = useState(false);
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
    const date = value("dive_date");
    const startAt = `${date}T${value("start_time")}`;
    const local = (name: string) => value(name) ? localAtForDive(startAt, value(name), value(name.replace("_time", "_date"))) : null;
    const verticalOnsetTime = local("vertical_onset_time");
    const verticalOnsetDepth = num("vertical_onset_depth");
    const verticalOnset = verticalOnsetTime || verticalOnsetDepth !== null
      ? { local_at: verticalOnsetTime, at: null, depth_m: verticalOnsetDepth }
      : null;
    return {
      id, local_start: `${date}T${value("start_time")}`, local_end: local("end_time"), timezone: "Asia/Makassar", time_precision: String(form.get("time_precision")),
      site_id: value("site_id"), zone_id: value("zone_id") || null, route_description: value("route_description"), representative_depth_m: num("representative_depth_m"),
      overall_pci: num("overall_pci"), vertical: { direction: String(form.get("direction")), intensity: num("intensity") }, vertical_onset: verticalOnset,
      confidence: String(form.get("confidence")), peak_events: peakEnabled ? [{ id: peakId, local_at: local("peak_time"), at: null, depth_m: num("peak_depth"), zone_id: value("peak_zone") || null, pci: num("peak_pci"), duration_description: value("peak_duration") || null, vertical_direction: String(form.get("peak_direction")), vertical_intensity: num("peak_intensity") }] : [],
      time_samples: sampleRows.flatMap((sample) => {
        const time = value(`sample-${sample.id}-time`);
        const zone = value(`sample-${sample.id}-zone`);
        const depth = num(`sample-${sample.id}-depth`);
        const temperature = num(`sample-${sample.id}-temperature`);
        const pci = num(`sample-${sample.id}-pci`);
        const direction = value(`sample-${sample.id}-direction`) || "unknown";
        if (!time) return zone || depth !== null || temperature !== null || pci !== null ? [{ id: sample.id, local_at: "", at: null, zone_id: zone || null, depth_m: depth, temperature_c: temperature, perceived_pci: pci, horizontal_direction: direction }] : [];
        return [{ id: sample.id, local_at: localAtForDive(startAt, time, value(`sample-${sample.id}-date`) || sample.date), at: null, zone_id: zone || null, depth_m: depth, temperature_c: temperature, perceived_pci: pci, horizontal_direction: direction }];
      }),
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
    setCorrectionDraft((current) => current ? { ...current, peak_events: (current.peak_events ?? []).map((event: Row, index: number) => index === eventIndex ? { ...event, [field]: value, ...(field === "local_at" ? { at: null } : {}) } : event) } : current);
  }

  function updateCorrectionTemperature(value: string) {
    setCorrectionDraft((current) => current ? { ...current, observed_temperature: value === "" ? null : { ...(current.observed_temperature ?? { depth_m: null, at: null }), celsius: value } } : current);
  }

  function updateCorrectionSample(id: string, field: keyof SampleDraft, value: string) {
    setCorrectionSamples((current) => current.map((sample) => sample.id === id ? { ...sample, [field]: value } : sample));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (consent && (!draftsLoaded || (restore.some((item) => item.id === "active") && !draftPayload))) { setMessage(t.restoreManual); return; }
    const form = new FormData(event.currentTarget);
    const payload = pendingCreate?.id === id && pendingCreate.key === key ? pendingCreate.payload : buildPayload(form);
    if ((payload.time_samples ?? []).some((sample: Row) => !sample.local_at)) { setMessage(t.sampleTimeRequired); return; }
    if (payload.local_end && payload.local_end <= payload.local_start) { setMessage(t.endBeforeStart); return; }
    if ((payload.time_samples ?? []).some((sample: Row) => sample.local_at < payload.local_start || (payload.local_end && sample.local_at > payload.local_end))) { setMessage(t.sampleOutsideDive); return; }
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
      setMessage(t.saved); setPendingCreate(null); await draft("delete", { id: "active" }).catch(() => undefined); setRestore([]); setDraftPayload(null); setSampleRows([]); setId(uuid()); setKey(uuid()); setPeakId(uuid()); setPeakEnabled(false); setFormEpoch((value) => value + 1); (event.currentTarget as HTMLFormElement).reset(); await load();
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION") {
        setSessionExpired(true);
        setMessage(t.session);
      } else setMessage(error instanceof Error ? error.message : t.saveError);
    } finally { setBusy(false); }
  }

  async function openRow(row: Row) {
    const response = await fetch(`/api/admin/observations/${row.id}`, { cache: "no-store" });
    if (response.ok) { const data = { ...(await response.json()).data, etag: response.headers.get("etag") }; setSelected(data); setCorrectionDraft(data); setCorrectionSamples(sampleDrafts(data.time_samples ?? [])); setCorrectionPCI(data.overall_pci); setCorrectionNotes(data.notes_public ?? ""); setConflictPair(null); }
    else setMessage(t.listError);
  }

  async function mutateSelected(action: "correct" | "withdraw") {
    if (!selected || !correctionDraft) return;
    if (action === "correct" && correctionSamples.some((sample) => !sample.time)) { setMessage(t.sampleTimeRequired); return; }
    if (action === "correct" && correctionDraft.local_end && correctionDraft.local_end <= correctionDraft.local_start) { setMessage(t.endBeforeStart); return; }
    if (action === "correct" && correctionSamples.some((sample) => {
      const at = localAtForDive(correctionDraft.local_start, sample.time, sample.date);
      return at < correctionDraft.local_start || (correctionDraft.local_end && at > correctionDraft.local_end);
    })) { setMessage(t.sampleOutsideDive); return; }
    if (action === "correct" && (correctionDraft.peak_events ?? []).some((event: Row) => event.pci !== null && event.pci !== "" && Number(event.pci) < correctionPCI)) { setMessage(t.peakBelowOverall); return; }
    let pending = pendingMutation;
    if (!pending || pending.id !== selected.id || pending.action !== action) {
      const reason = window.prompt(t.reasonPrompt);
      if (!reason?.trim()) return;
      pending = { id: selected.id, action, key: uuid(), reason: reason.trim(), pci: correctionPCI, notes: correctionNotes, etag: selected.etag, record: { ...correctionDraft, time_samples: correctionSamples.map((sample) => ({ id: sample.id, local_at: sample.time ? localAtForDive(correctionDraft.local_start, sample.time, sample.date) : "", zone_id: sample.zone || null, depth_m: sample.depth === "" ? null : Number(sample.depth), temperature_c: sample.temperature === "" ? null : Number(sample.temperature), perceived_pci: sample.pci === "" ? null : Number(sample.pci), horizontal_direction: sample.direction || "unknown" })) }, public_summary_ko: selected.public_summary_ko, public_summary_en: selected.public_summary_en };
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
        peak_events: (pending.record.peak_events ?? []).map((item: Row) => ({ ...item, local_at: item.local_at !== undefined ? item.local_at : (item.at ? utcToWitaLocal(item.at) : null), at: null, pci: item.pci === "" || item.pci === null ? null : Number(item.pci), depth_m: item.depth_m === "" || item.depth_m === null || item.depth_m === undefined ? null : Number(item.depth_m), vertical_intensity: item.vertical_intensity === "" || item.vertical_intensity === null || item.vertical_intensity === undefined ? null : Number(item.vertical_intensity), zone_id: item.zone_id || null, duration_description: item.duration_description ?? null })),
        time_samples: correctionSamples.map((sample) => ({ id: sample.id, local_at: localAtForDive(pending.record.local_start, sample.time, sample.date), at: null, zone_id: sample.zone || null, depth_m: sample.depth === "" ? null : Number(sample.depth), temperature_c: sample.temperature === "" ? null : Number(sample.temperature), perceived_pci: sample.pci === "" ? null : Number(sample.pci), horizontal_direction: sample.direction || "unknown" })),
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
        if (latest.ok) { const data = { ...(await latest.json()).data, etag: latest.headers.get("etag") }; setConflictPair({ old: selected, latest: data }); setSelected(data); setCorrectionDraft(data); setCorrectionSamples(sampleDrafts(data.time_samples ?? [])); }
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

  const defaultDate = (draftPayload?.local_start as string | undefined)?.slice(0, 10) ?? witaToday();
  return <main className={styles.shell} lang={locale}>
    <header className={styles.header}><div><p className={styles.eyebrow}>BUNAKEN · {alias ?? "ADMIN"}</p><h1>{t.title}</h1><p>{t.publicWarning}</p></div><button className={styles.logout} onClick={async () => { await draft("clear").catch(() => undefined); try { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) { window.location.assign(`/${locale}/admin/login`); return; } const csrf = (await response.json()).data.csrf_token; const result = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } }); if (result.ok) window.location.assign(`/${locale}/admin/login`); else setMessage(t.logoutError); } catch { setMessage(t.logoutError); } }}>{t.logout}</button></header>
    <nav className={styles.lang}><a href="/ko/admin" aria-current={locale === "ko" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("ko"); }}>한국어</a><a href="/en/admin" aria-current={locale === "en" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("en"); }}>English</a></nav>
    <section className={styles.layout}>
      <form className={styles.form} key={formEpoch} onSubmit={save} onChange={(event) => { if ((event.nativeEvent.target as HTMLInputElement).name !== "draft_consent") preserveDraft(event.currentTarget); }}>
        <h2>{t.newRecord}</h2>
        <fieldset disabled={busy || Boolean(pendingCreate)} className={styles.fields}>
        <section className={styles.formSection} aria-labelledby="dive-heading">
          <h3 id="dive-heading">{t.diveDetails}</h3>
          <div className={styles.timePair}>
            <label>{t.date}<input name="dive_date" type="date" defaultValue={defaultDate} required /></label>
            <label>{t.startTime}<input name="start_time" type="time" defaultValue={(draftPayload?.local_start as string | undefined)?.slice(11, 16)} required /></label>
            <label>{t.endTime}<input name="end_time" type="time" defaultValue={(draftPayload?.local_end as string | null | undefined)?.slice(11, 16) ?? ""} /></label>
            <label>{t.endDate}<input name="end_date" type="date" defaultValue={(draftPayload?.local_end as string | null | undefined)?.slice(0, 10) ?? defaultDate} /></label>
          </div>
          <small>{t.wita}</small>
          <label>{t.timePrecision}<select name="time_precision" required defaultValue={(draftPayload?.time_precision as string | undefined) ?? "reported_minute"}><option value="reported_minute">{t.minuteExact}</option><option value="approximate">{t.approximate}</option></select></label>
          <label>{t.site}<select name="site_id" required defaultValue={resolveSiteId(draftPayload?.site_id) ?? ""}><option value="" disabled>{t.sitePlaceholder}</option>{sites.map((site) => <option key={site.id} value={site.id}>{locale === "ko" ? site.name_ko : site.name_en}</option>)}</select></label>
          <label>{t.zone}<input name="zone_id" autoComplete="off" placeholder={t.unknown} defaultValue={draftPayload?.zone_id ?? ""} /></label>
          <label>{t.routeDescription}<input name="route_description" maxLength={300} placeholder={t.routePlaceholder} defaultValue={draftPayload?.route_description ?? ""} /></label>
          <label>{t.representativeDepth}<input name="representative_depth_m" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={draftPayload?.representative_depth_m ?? ""} /></label>
          <small>{t.representativeDepthHelp}</small>
        </section>
        <section className={styles.formSection} aria-labelledby="overall-heading">
          <h3 id="overall-heading">{t.overallAssessment}</h3>
          <label>{t.pci}<input name="overall_pci" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={draftPayload?.overall_pci as number | undefined} /></label><small>{t.pciHelp}</small>
          <div className={styles.timePair}>
            <label>{t.vertical}<select name="direction" defaultValue={(draftPayload?.vertical as Row | undefined)?.direction as string ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
            <label>{t.intensity}<input name="intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={(draftPayload?.vertical as Row | undefined)?.intensity ?? ""} /></label>
            <label>{t.confidence}<select name="confidence" defaultValue={draftPayload?.confidence as string ?? "normal"}><option value="high">{t.high}</option><option value="normal">{t.normal}</option><option value="low">{t.low}</option></select></label>
          </div>
          <details><summary>{t.verticalOnset}</summary>
            <div className={styles.timePair}>
              <label>{t.date}<input name="vertical_onset_date" type="date" defaultValue={(draftPayload?.vertical_onset as Row | null | undefined)?.local_at?.slice(0, 10) ?? defaultDate} /></label>
              <label>{t.onsetTime}<input name="vertical_onset_time" type="time" defaultValue={(draftPayload?.vertical_onset as Row | null | undefined)?.local_at?.slice(11, 16) ?? ""} /></label>
              <label>{t.onsetDepth}<input name="vertical_onset_depth" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={(draftPayload?.vertical_onset as Row | null | undefined)?.depth_m ?? ""} /></label>
            </div>
            <small>{t.verticalOnsetHelp}</small>
          </details>
        </section>
        <section className={styles.formSection} aria-labelledby="samples-heading">
          <h3 id="samples-heading">{t.timeSamples}</h3>
          <p className={styles.help}>{t.timeSamplesHelp}</p>
          {sampleRows.map((sample, index) => <fieldset className={styles.sample} key={sample.id}>
            <legend>{t.sample} {index + 1}</legend>
            <div className={styles.timePair}>
              <label>{t.date}<input name={`sample-${sample.id}-date`} type="date" defaultValue={sample.date || defaultDate} /></label>
              <label>{t.sampleTime}<input name={`sample-${sample.id}-time`} type="time" defaultValue={sample.time} /></label>
              <label>{t.sampleZone}<input name={`sample-${sample.id}-zone`} defaultValue={sample.zone} /></label>
            </div>
            <div className={styles.timePair}>
              <label>{t.sampleDepth}<input name={`sample-${sample.id}-depth`} type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={sample.depth} /></label>
              <label>{t.sampleTemperature}<input name={`sample-${sample.id}-temperature`} type="number" inputMode="decimal" min="-3" max="45" step="0.1" defaultValue={sample.temperature} /></label>
            </div>
            <div className={styles.timePair}>
              <label>{t.samplePCI}<input name={`sample-${sample.id}-pci`} type="number" inputMode="decimal" min="0" step="0.01" defaultValue={sample.pci} /></label>
              <label>{t.horizontalDirection}<select name={`sample-${sample.id}-direction`} defaultValue={sample.direction}><option value="unknown">{t.unknown}</option><option value="with_route">{t.withRoute}</option><option value="against_route">{t.againstRoute}</option><option value="crossing_route">{t.crossingRoute}</option></select></label>
            </div>
            <button type="button" className={styles.secondary} onClick={() => setSampleRows((current) => current.filter((item) => item.id !== sample.id))}>{t.removeSample}</button>
          </fieldset>)}
          <button type="button" className={styles.secondary} disabled={sampleRows.length >= 50} onClick={() => setSampleRows((current) => [...current, { id: uuid(), date: "", time: "", zone: "", depth: "", temperature: "", pci: "", direction: "unknown" }])}>{t.addSample}</button>
        </section>
        <details className={styles.optionalSection}><summary>{t.peakAndNotes}</summary>
          <label>{t.temperature}<input name="temperature" type="number" inputMode="decimal" min="-3" max="45" step="0.1" defaultValue={(draftPayload?.observed_temperature as Row | null | undefined)?.celsius ?? ""} /></label>
          <label>{t.notes}<textarea name="notes_public" maxLength={5000} rows={4} defaultValue={draftPayload?.notes_public as string | undefined} /></label>
          <label className={styles.check}><input type="checkbox" checked={peakEnabled} onChange={(event) => setPeakEnabled(event.target.checked)} />{t.peak}</label>
          {peakEnabled && <>
            <label>{t.date}<input name="peak_date" type="date" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.local_at as string | undefined)?.slice(0, 10) ?? defaultDate} /></label>
            <label>{t.peakTime}<input name="peak_time" type="time" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.local_at as string | undefined)?.slice(11, 16) ?? ""} /></label>
            <label>{t.peakPCI}<input name="peak_pci" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.pci ?? "") as number | string} /></label>
            <label>{t.peakDepth}<input name="peak_depth" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.depth_m ?? "") as number | string} /></label>
            <label>{t.peakZone}<input name="peak_zone" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.zone_id ?? "") as string} /></label>
            <label>{t.peakDuration}<input name="peak_duration" maxLength={300} placeholder={t.peakDurationPlaceholder} defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.duration_description ?? "") as string} /></label>
            <label>{t.peakDirection}<select name="peak_direction" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_direction as string) ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
            <label>{t.peakIntensity}<input name="peak_intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_intensity ?? "") as number | string} /></label>
          </>}
        </details>
        <label className={styles.check}><input name="use_for_model" type="checkbox" defaultChecked={draftPayload?.use_for_model !== false} />{t.modelUse}</label>
        <label className={styles.check}><input name="draft_consent" type="checkbox" checked={consent} onChange={(event) => { const enabled = event.target.checked; setConsent(enabled); if (enabled) { setDraftsLoaded(false); setRestore([]); } else { setRestore([]); setDraftPayload(null); setDraftsLoaded(false); void draft("clear").catch(() => setMessage(t.draftUnavailable)); } }} />{t.draftConsent}</label>
        {restore.some((x) => x.id === "active") && <button type="button" className={styles.secondary} onClick={() => { const item = restore.find((x) => x.id === "active"); if (!item) return; setDraftPayload(item.payload); setSampleRows(sampleDrafts(item.payload.time_samples ?? [])); setId(item.payload.id); setKey(item.key); if (item.pendingCreate) setPendingCreate({ id: item.payload.id, key: item.key, payload: item.payload }); const peak = (item.payload.peak_events as Row[] | undefined)?.[0]; setPeakEnabled(Boolean(peak)); setPeakId((peak?.id as string) ?? uuid()); setFormEpoch((value) => value + 1); setMessage(t.restoreManual); }}>{t.restoreDraft}</button>}
        {restore.some((x) => x.id === "pending-mutation") && <button type="button" className={styles.secondary} onClick={() => { const item = restore.find((x) => x.id === "pending-mutation"); if (!item?.pendingMutation) return; const pending = item.pendingMutation; setPendingMutation(pending); setCorrectionSamples(sampleDrafts(pending.record.time_samples ?? [])); void fetch(`/api/admin/observations/${pending.id}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const data = { ...(await response.json()).data, etag: pending.etag }; setSelected(data); setCorrectionDraft(pending.record); setCorrectionPCI(pending.pci); setCorrectionNotes(pending.notes); }).catch(() => setMessage(t.listError)); }}>{t.retryMutation}</button>}
        </fieldset>
        <p className={styles.notice}>{t.publicWarning}</p><button className={styles.primary} disabled={busy}>{busy ? t.saving : pendingCreate ? t.retryMutation : t.save}</button>{sessionExpired && <p><a target="_blank" rel="noreferrer" href={`/${locale}/admin/login?returnTo=${encodeURIComponent(`/${locale}/admin`)}&recover_draft=1`}>{t.relogin}</a></p>}<p role="status" aria-live="polite">{message}</p>
      </form>
      <section className={styles.records}><h2>{t.records}</h2>{rows.length === 0 ? <p>{t.empty}</p> : rows.map((row) => <button className={styles.record} key={row.id} disabled={Boolean(pendingMutation)} onClick={() => void openRow(row)}><strong>{siteLabel(row.site_id, locale)}</strong><span>{row.local_start}</span><span>PCI {row.overall_pci} · rev {row.revision}</span></button>)}{nextCursor && <button className={styles.secondary} onClick={() => void load(nextCursor, true)}>{t.moreRecords}</button>}
        {selected && <article className={styles.detail}>
          <button className={styles.close} disabled={Boolean(pendingMutation)} onClick={() => setSelected(null)}>{t.close}</button>
          <h3>{siteLabel(selected.site_id, locale)}</h3>
          <p>{selected.local_start} · PCI {selected.overall_pci} · rev {selected.revision}</p>
          <fieldset className={styles.fields} disabled={Boolean(pendingMutation)}>
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
              <fieldset className={styles.sample}><legend>{t.verticalOnset}</legend>
                <label>{t.onsetTime}<input type="datetime-local" value={correctionDraft?.vertical_onset?.local_at ?? ""} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, vertical_onset: event.target.value ? { ...(current.vertical_onset ?? { at: null, depth_m: null }), local_at: event.target.value } : null } : current)} /></label>
                <label>{t.onsetDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={correctionDraft?.vertical_onset?.depth_m ?? ""} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, vertical_onset: { ...(current.vertical_onset ?? { local_at: null, at: null }), depth_m: event.target.value === "" ? null : Number(event.target.value) } } : current)} /></label>
              </fieldset>
              <fieldset className={styles.sample}><legend>{t.timeSamples}</legend>
                {correctionSamples.map((sample, index) => <fieldset className={styles.sample} key={sample.id}><legend>{t.sample} {index + 1}</legend>
                  <label>{t.date}<input type="date" value={sample.date} onChange={(event) => updateCorrectionSample(sample.id, "date", event.target.value)} /></label>
                  <label>{t.sampleTime}<input type="time" value={sample.time} onChange={(event) => updateCorrectionSample(sample.id, "time", event.target.value)} /></label>
                  <label>{t.sampleZone}<input value={sample.zone} onChange={(event) => updateCorrectionSample(sample.id, "zone", event.target.value)} /></label>
                  <label>{t.sampleDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={sample.depth} onChange={(event) => updateCorrectionSample(sample.id, "depth", event.target.value)} /></label>
              <label>{t.sampleTemperature}<input type="number" inputMode="decimal" min="-3" max="45" step="0.1" value={sample.temperature} onChange={(event) => updateCorrectionSample(sample.id, "temperature", event.target.value)} /></label>
                  <label>{t.samplePCI}<input type="number" inputMode="decimal" min="0" step="0.01" value={sample.pci} onChange={(event) => updateCorrectionSample(sample.id, "pci", event.target.value)} /></label>
                  <label>{t.horizontalDirection}<select value={sample.direction} onChange={(event) => updateCorrectionSample(sample.id, "direction", event.target.value)}><option value="unknown">{t.unknown}</option><option value="with_route">{t.withRoute}</option><option value="against_route">{t.againstRoute}</option><option value="crossing_route">{t.crossingRoute}</option></select></label>
                  <button type="button" className={styles.secondary} onClick={() => setCorrectionSamples((current) => current.filter((item) => item.id !== sample.id))}>{t.removeSample}</button>
                </fieldset>)}
                <button type="button" className={styles.secondary} disabled={correctionSamples.length >= 50} onClick={() => setCorrectionSamples((current) => [...current, { id: uuid(), date: "", time: "", zone: "", depth: "", temperature: "", pci: "", direction: "unknown" }])}>{t.addSample}</button>
              </fieldset>
              {(correctionDraft?.peak_events ?? []).map((event: Row, index: number) => <fieldset className={styles.sample} key={event.id ?? index}><legend>{t.peak} {index + 1}</legend>
                <label>{t.peakTime}<input type="datetime-local" value={event.local_at ?? (event.at ? utcToWitaLocal(event.at) : "")} onChange={(input) => updateCorrectionPeak(index, "local_at", input.target.value || null)} /></label>
                <label>{t.peakPCI}<input type="number" inputMode="decimal" min="0" step="0.01" value={event.pci ?? ""} onChange={(input) => updateCorrectionPeak(index, "pci", input.target.value)} /></label>
                <label>{t.peakDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={event.depth_m ?? ""} onChange={(input) => updateCorrectionPeak(index, "depth_m", input.target.value)} /></label>
                <label>{t.peakZone}<input value={event.zone_id ?? ""} onChange={(input) => updateCorrectionPeak(index, "zone_id", input.target.value || null)} /></label>
                <label>{t.vertical}<select value={event.vertical_direction ?? "unknown"} onChange={(input) => updateCorrectionPeak(index, "vertical_direction", input.target.value)}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
                <label>{t.intensity}<input type="number" inputMode="decimal" min="0" step="0.01" value={event.vertical_intensity ?? ""} onChange={(input) => updateCorrectionPeak(index, "vertical_intensity", input.target.value)} /></label>
                <label>{t.peakDuration}<input maxLength={300} placeholder={t.peakDurationPlaceholder} value={event.duration_description ?? ""} onChange={(input) => updateCorrectionPeak(index, "duration_description", input.target.value)} /></label>
                <button type="button" className={styles.secondary} onClick={() => setCorrectionDraft((current) => current ? { ...current, peak_events: (current.peak_events ?? []).filter((_: Row, i: number) => i !== index) } : current)}>{t.removePeak}</button>
              </fieldset>)}
              <button type="button" className={styles.secondary} disabled={(correctionDraft?.peak_events ?? []).length >= 20} onClick={() => setCorrectionDraft((current) => current ? { ...current, peak_events: [...(current.peak_events ?? []), { id: uuid(), local_at: null, at: null, pci: null, depth_m: null, zone_id: null, vertical_direction: "unknown", vertical_intensity: null, duration_description: null }] } : current)}>{t.addPeak}</button>
            </details>
            <label>{t.correctedPCI}<input type="number" inputMode="decimal" min="0" step="0.01" value={correctionPCI} onChange={(event) => setCorrectionPCI(Number(event.target.value))} /></label>
            <label>{t.notes}<textarea maxLength={5000} rows={4} value={correctionNotes} onChange={(event) => setCorrectionNotes(event.target.value)} /></label>
          </fieldset>
          <p>{t.historyWarning}</p>
          {selected.record_status !== "withdrawn" && <><button className={styles.secondary} disabled={Boolean(pendingMutation && (pendingMutation.id !== selected.id || pendingMutation.action !== "correct"))} onClick={() => void mutateSelected("correct")}>{pendingMutation?.action === "correct" && pendingMutation.id === selected.id ? t.retryMutation : t.correct}</button>
          <button className={styles.secondary} disabled={Boolean(pendingMutation && (pendingMutation.id !== selected.id || pendingMutation.action !== "withdraw"))} onClick={() => void mutateSelected("withdraw")}>{pendingMutation?.action === "withdraw" && pendingMutation.id === selected.id ? t.retryMutation : t.withdraw}</button></>}
          {conflictPair && <div className={styles.notice} role="alert"><strong>{t.conflict}</strong><p>{t.oldValue}: PCI {conflictPair.old.overall_pci}, rev {conflictPair.old.revision}</p><p>{t.newValue}: PCI {conflictPair.latest.overall_pci}, rev {conflictPair.latest.revision}</p></div>}
        </article>}
      </section>
    </section>
  </main>;
}
