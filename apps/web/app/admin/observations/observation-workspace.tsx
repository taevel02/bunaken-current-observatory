"use client";

import { FormEvent, useEffect, useState } from "react";
import { messages } from "../../../i18n/messages";
import styles from "./workspace.module.css";

type Locale = "ko" | "en";
// Dynamic public JSON revision shapes are validated at the API boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const DB = "bunaken-observation-drafts";
const STORE = "drafts";
const uuid = () => crypto.randomUUID();
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
    const num = (name: string) => Number(form.get(name));
    return {
      id, local_start: String(form.get("local_start")), local_end: null, timezone: "Asia/Makassar", time_precision: String(form.get("time_precision")),
      site_id: String(form.get("site_id")), zone_id: form.get("zone_id") || null, start_depth_m: num("start_depth_m"), representative_depth_m: form.get("representative_depth_m") ? num("representative_depth_m") : null,
      overall_pci: num("overall_pci"), vertical: { direction: String(form.get("direction")), intensity: form.get("intensity") ? num("intensity") : null }, confidence: String(form.get("confidence")), peak_events: peakEnabled ? [{ id: peakId, at: null, depth_m: form.get("peak_depth") ? num("peak_depth") : null, zone_id: form.get("peak_zone") || null, pci: form.get("peak_pci") ? num("peak_pci") : null, vertical_direction: String(form.get("peak_direction")), vertical_intensity: form.get("peak_intensity") ? num("peak_intensity") : null }] : [],
      observed_temperature: form.get("temperature") ? { celsius: num("temperature"), depth_m: null, at: null } : null,
      notes_public: String(form.get("notes_public")), use_for_model: form.get("use_for_model") === "on",
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

  function updateCorrectionTemperature(value: string) {
    setCorrectionDraft((current) => current ? { ...current, observed_temperature: value === "" ? null : { ...(current.observed_temperature ?? { depth_m: null, at: null }), celsius: value } } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (consent && (!draftsLoaded || (restore.some((item) => item.id === "active") && !draftPayload))) { setMessage(t.restoreManual); return; }
    setBusy(true); setMessage(t.saving);
    const form = new FormData(event.currentTarget);
    const payload = pendingCreate?.id === id && pendingCreate.key === key ? pendingCreate.payload : buildPayload(form);
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
      setMessage(t.saved); setPendingCreate(null); await draft("delete", { id: "active" }).catch(() => undefined); setRestore([]); setDraftPayload(null); setId(uuid()); setKey(uuid()); setPeakId(uuid()); setPeakEnabled(false); setFormEpoch((value) => value + 1); (event.currentTarget as HTMLFormElement).reset(); await load();
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
        site_id: pending.record.site_id, zone_id: pending.record.zone_id || null, start_depth_m: Number(pending.record.start_depth_m), representative_depth_m: pending.record.representative_depth_m === "" || pending.record.representative_depth_m === null ? null : Number(pending.record.representative_depth_m),
        overall_pci: pending.pci, vertical: { direction: pending.record.vertical.direction, intensity: pending.record.vertical.intensity === "" || pending.record.vertical.intensity === null ? null : Number(pending.record.vertical.intensity) }, confidence: pending.record.confidence, peak_events: pending.record.peak_events,
        observed_temperature: pending.record.observed_temperature ? { ...pending.record.observed_temperature, celsius: pending.record.observed_temperature.celsius === "" || pending.record.observed_temperature.celsius === null ? null : Number(pending.record.observed_temperature.celsius) } : null, notes_public: pending.notes, public_summary_ko: pending.public_summary_ko,
        public_summary_en: pending.public_summary_en, use_for_model: pending.record.use_for_model, correction_reason: pending.reason,
      };
      let response: Response;
      try {
        response = await fetch(action === "withdraw" ? `/api/admin/observations/${selected.id}/withdraw` : `/api/admin/observations/${selected.id}`, {
          method: action === "withdraw" ? "POST" : "PATCH", headers, body: JSON.stringify(body),
        });
      } catch {
        const status = await fetch("/api/admin/requests/status", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ idempotency_key: pending.key }) });
        if (!status.ok) throw new Error(t.retrySame);
        if (!(await status.json()).data.found) throw new Error(t.retrySame);
        response = new Response(null, { status: 200 });
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

  return <main className={styles.shell} lang={locale}>
    <header className={styles.header}><div><p className={styles.eyebrow}>BUNAKEN · {alias ?? "ADMIN"}</p><h1>{t.title}</h1><p>{t.publicWarning}</p></div><button className={styles.logout} onClick={async () => { await draft("clear").catch(() => undefined); try { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) { window.location.assign(`/${locale}/admin/login`); return; } const csrf = (await response.json()).data.csrf_token; const result = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } }); if (result.ok) window.location.assign(`/${locale}/admin/login`); else setMessage(t.logoutError); } catch { setMessage(t.logoutError); } }}>{t.logout}</button></header>
    <nav className={styles.lang}><a href="/ko/admin" aria-current={locale === "ko" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("ko"); }}>한국어</a><a href="/en/admin" aria-current={locale === "en" ? "page" : undefined} onClick={(event) => { event.preventDefault(); switchLocale("en"); }}>English</a></nav>
    <section className={styles.layout}>
      <form className={styles.form} key={formEpoch} onSubmit={save} onChange={(event) => { if ((event.nativeEvent.target as HTMLInputElement).name !== "draft_consent") preserveDraft(event.currentTarget); }}>
        <h2>{t.newRecord}</h2>
        <fieldset disabled={busy || Boolean(pendingCreate)} className={styles.fields}>
        <label>{t.dateTime}<input name="local_start" type="datetime-local" defaultValue={draftPayload?.local_start as string | undefined} required /></label><small>{t.wita}</small>
        <label>{t.timePrecision}<select name="time_precision" required defaultValue={(draftPayload?.time_precision as string | undefined) ?? ""}><option value="" disabled>{t.choose}</option><option value="reported_minute">{t.minuteExact}</option><option value="approximate">{t.approximate}</option></select></label>
        <label>{t.site}<input name="site_id" autoComplete="off" required placeholder={t.sitePlaceholder} defaultValue={draftPayload?.site_id} /></label>
        <label>{t.zone}<input name="zone_id" autoComplete="off" placeholder={t.unknown} defaultValue={draftPayload?.zone_id ?? ""} /></label>
        <label>{t.startDepth}<input name="start_depth_m" type="number" inputMode="decimal" min="0" max="200" step="0.1" required defaultValue={draftPayload?.start_depth_m as number | undefined} /></label>
        <label>{t.representativeDepth}<input name="representative_depth_m" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={draftPayload?.representative_depth_m as number | undefined} /></label>
        <label>{t.pci}<input name="overall_pci" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={draftPayload?.overall_pci as number | undefined} /></label><small>{t.pciHelp}</small>
        <label>{t.vertical}<select name="direction" defaultValue={(draftPayload?.vertical as Row | undefined)?.direction as string ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
        <label>{t.intensity}<input name="intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={(draftPayload?.vertical as Row | undefined)?.intensity as number | undefined} /></label>
        <label>{t.confidence}<select name="confidence" defaultValue={draftPayload?.confidence as string ?? "normal"}><option value="high">{t.high}</option><option value="normal">{t.normal}</option><option value="low">{t.low}</option></select></label>
        <details><summary>{t.optional}</summary><label>{t.temperature}<input name="temperature" type="number" inputMode="decimal" min="-3" max="45" step="0.1" defaultValue={(draftPayload?.observed_temperature as Row | null | undefined)?.celsius as number | undefined} /></label><label>{t.notes}<textarea name="notes_public" maxLength={5000} rows={4} defaultValue={draftPayload?.notes_public as string | undefined} /></label><label className={styles.check}><input type="checkbox" checked={peakEnabled} onChange={(event) => setPeakEnabled(event.target.checked)} />{t.peak}</label>{peakEnabled && <><label>{t.peakPCI}<input name="peak_pci" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.pci ?? undefined) as number | undefined} /></label><label>{t.peakDepth}<input name="peak_depth" type="number" inputMode="decimal" min="0" max="200" step="0.1" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.depth_m ?? undefined) as number | undefined} /></label><label>{t.peakZone}<input name="peak_zone" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.zone_id ?? "") as string} /></label><label>{t.peakDirection}<select name="peak_direction" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_direction as string) ?? "unknown"}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label><label>{t.peakIntensity}<input name="peak_intensity" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={((draftPayload?.peak_events as Row[] | undefined)?.[0]?.vertical_intensity ?? undefined) as number | undefined} /></label></>}</details>
        <label className={styles.check}><input name="use_for_model" type="checkbox" defaultChecked={draftPayload?.use_for_model !== false} />{t.modelUse}</label>
        <label className={styles.check}><input name="draft_consent" type="checkbox" checked={consent} onChange={(event) => { const enabled = event.target.checked; setConsent(enabled); if (enabled) { setDraftsLoaded(false); setRestore([]); } else { setRestore([]); setDraftPayload(null); setDraftsLoaded(false); void draft("clear").catch(() => setMessage(t.draftUnavailable)); } }} />{t.draftConsent}</label>
        {restore.some((x) => x.id === "active") && <button type="button" className={styles.secondary} onClick={() => { const item = restore.find((x) => x.id === "active"); if (!item) return; setDraftPayload(item.payload); setId(item.payload.id); setKey(item.key); if (item.pendingCreate) setPendingCreate({ id: item.payload.id, key: item.key, payload: item.payload }); const peak = (item.payload.peak_events as Row[] | undefined)?.[0]; setPeakEnabled(Boolean(peak)); setPeakId((peak?.id as string) ?? uuid()); setFormEpoch((value) => value + 1); setMessage(t.restoreManual); }}>{t.restoreDraft}</button>}
        {restore.some((x) => x.id === "pending-mutation") && <button type="button" className={styles.secondary} onClick={() => { const item = restore.find((x) => x.id === "pending-mutation"); if (!item?.pendingMutation) return; const pending = item.pendingMutation; setPendingMutation(pending); void fetch(`/api/admin/observations/${pending.id}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const data = { ...(await response.json()).data, etag: pending.etag }; setSelected(data); setCorrectionDraft(pending.record); setCorrectionPCI(pending.pci); setCorrectionNotes(pending.notes); }).catch(() => setMessage(t.listError)); }}>{t.retryMutation}</button>}
        </fieldset>
        <p className={styles.notice}>{t.publicWarning}</p><button className={styles.primary} disabled={busy}>{busy ? t.saving : pendingCreate ? t.retryMutation : t.save}</button>{sessionExpired && <p><a target="_blank" rel="noreferrer" href={`/${locale}/admin/login?returnTo=${encodeURIComponent(`/${locale}/admin`)}&recover_draft=1`}>{t.relogin}</a></p>}<p role="status" aria-live="polite">{message}</p>
      </form>
      <section className={styles.records}><h2>{t.records}</h2>{rows.length === 0 ? <p>{t.empty}</p> : rows.map((row) => <button className={styles.record} key={row.id} disabled={Boolean(pendingMutation)} onClick={() => void openRow(row)}><strong>{row.site_id}</strong><span>{row.local_start}</span><span>PCI {row.overall_pci} · rev {row.revision}</span></button>)}{nextCursor && <button className={styles.secondary} onClick={() => void load(nextCursor, true)}>{t.moreRecords}</button>}
        {selected && <article className={styles.detail}>
          <button className={styles.close} disabled={Boolean(pendingMutation)} onClick={() => setSelected(null)}>{t.close}</button>
          <h3>{selected.site_id}</h3>
          <p>{selected.local_start} · PCI {selected.overall_pci} · rev {selected.revision}</p>
          <fieldset className={styles.fields} disabled={Boolean(pendingMutation)}>
            <details><summary>{t.correctFields}</summary>
              <label>{t.dateTime}<input type="datetime-local" value={correctionDraft?.local_start ?? ""} onChange={(event) => updateCorrection("local_start", event.target.value)} /></label>
              <label>{t.timePrecision}<select value={correctionDraft?.time_precision ?? ""} onChange={(event) => updateCorrection("time_precision", event.target.value)}><option value="reported_minute">{t.minuteExact}</option><option value="approximate">{t.approximate}</option></select></label>
              <label>{t.site}<input value={correctionDraft?.site_id ?? ""} onChange={(event) => updateCorrection("site_id", event.target.value)} /></label>
              <label>{t.zone}<input value={correctionDraft?.zone_id ?? ""} onChange={(event) => updateCorrection("zone_id", event.target.value)} /></label>
              <label>{t.startDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={correctionDraft?.start_depth_m ?? ""} onChange={(event) => updateCorrection("start_depth_m", event.target.value)} /></label>
              <label>{t.representativeDepth}<input type="number" inputMode="decimal" min="0" max="200" step="0.1" value={correctionDraft?.representative_depth_m ?? ""} onChange={(event) => updateCorrection("representative_depth_m", event.target.value)} /></label>
              <label>{t.vertical}<select value={correctionDraft?.vertical?.direction ?? "unknown"} onChange={(event) => updateCorrectionVertical("direction", event.target.value)}><option value="unknown">{t.unknown}</option><option value="none">{t.none}</option><option value="down">{t.down}</option><option value="up">{t.up}</option><option value="mixed">{t.mixed}</option></select></label>
              <label>{t.intensity}<input type="number" inputMode="decimal" min="0" step="0.01" value={correctionDraft?.vertical?.intensity ?? ""} onChange={(event) => updateCorrectionVertical("intensity", event.target.value)} /></label>
              <label>{t.confidence}<select value={correctionDraft?.confidence ?? "normal"} onChange={(event) => updateCorrection("confidence", event.target.value)}><option value="high">{t.high}</option><option value="normal">{t.normal}</option><option value="low">{t.low}</option></select></label>
              <label>{t.temperature}<input type="number" inputMode="decimal" min="-3" max="45" step="0.1" value={correctionDraft?.observed_temperature?.celsius ?? ""} onChange={(event) => updateCorrectionTemperature(event.target.value)} /></label>
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
