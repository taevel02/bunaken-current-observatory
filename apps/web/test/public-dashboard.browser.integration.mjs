/* global document, innerWidth, getComputedStyle */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { gunzipSync } from "node:zlib";
import process from "node:process";
import test from "node:test";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configured = process.env.BUNAKEN_PLAYWRIGHT_MODULE && process.env.BUNAKEN_DASHBOARD_URL && process.env.BUNAKEN_PUBLIC_RELEASE_DIR;

test("actual public package renders with site, language, model and viewport parity", { skip: !configured }, async () => {
  const { chromium } = await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
  const base = process.env.BUNAKEN_DASHBOARD_URL;
  const directory = resolve(process.env.BUNAKEN_PUBLIC_RELEASE_DIR, "web");
  const pointer = JSON.parse(await readFile(join(directory, "latest.json"), "utf8"));
  const packed = await readFile(join(directory, "releases", pointer.release_id, "dashboard.json.gz"));
  const payload = JSON.parse(gunzipSync(packed));
  const day = process.env.BUNAKEN_DASHBOARD_DAY || new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(payload.valid_start));
  const artifacts = process.env.BUNAKEN_UI_ARTIFACT_DIR || "/private/tmp/bunaken-public-browser-artifacts";
  await mkdir(artifacts, { recursive: true });
  const status = await (await globalThis.fetch(base + "/api/public/status")).json();
  assert.equal(status.status, "available");
  assert.equal(status.release_id, pointer.release_id);
  const expectedObservations = payload.observations.filter(row => row.record_status !== "withdrawn").length;
  const browser = await chromium.launch({ executablePath: process.env.BUNAKEN_BROWSER_EXECUTABLE, headless: true });
  const errors = [];
  const resourceErrors = [];
  const checks = [];
  const dayOf = at => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(at));
  const expectedDots = (site, mode) => (mode === "transfer" ? payload.experimental_transfer.predictions.map(row => row.prediction) : payload.predictions)
    .filter(row => row.zone_id === null && dayOf(row.start_at) === day && (!site || row.site_id === site) && row.pci !== null && row.prediction_status !== "insufficient").length;
  try {
    for (const width of [1920, 360]) {
      for (const locale of ["ko", "en"]) {
        const messages = JSON.parse(await readFile(join(app, "i18n", locale + ".json"), "utf8")).public;
        const page = await browser.newPage({ viewport: { width, height: 1080 } });
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
          if (message.type() === "error") errors.push({ message: message.text(), url: message.location().url });
        });
        page.on("response", response => {
          if (response.status() >= 400) resourceErrors.push({ status: response.status(), url: response.url() });
        });
        const response = await page.goto(`${base}/${locale}?date=${day}&model=baseline&signal=pci`, { waitUntil: "networkidle" });
        assert.equal(response.status(), 200);
        const table = page.locator("main tbody tr");
        assert.equal(await table.count(), 19);
        assert.equal(await page.locator('select[name="site"] option').count(), 20);
        const counts = await table.locator("td:first-of-type").allTextContents();
        const numbers = counts.map(Number);
        assert.equal(numbers.reduce((sum, value) => sum + value, 0), expectedObservations);
        assert.deepEqual(numbers, [...numbers].sort((a, b) => b - a));
        const graph = page.locator('main section').first().locator('svg[role="img"]');
        assert.equal(await graph.locator("circle").count(), expectedDots("", "baseline"));
        const bounds = await graph.boundingBox();
        const sectionBounds = await page.locator("main section").first().boundingBox();
        assert.ok(bounds.width >= sectionBounds.width * .95);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const hint = page.locator("main section").first().locator("p").last();
        assert.equal(await hint.evaluate(element => getComputedStyle(element).marginTop), "8px");
        await page.screenshot({ path: join(artifacts, `${locale}-${width}-overview.png`), fullPage: true });
        for (const site of ["rons-point", "mikes-point"]) {
          await page.locator('select[name="site"]').selectOption(site);
          await page.locator('select[name="model"]').selectOption("baseline");
          await page.locator('form[method="get"] button').click();
          await page.waitForURL(url => url.searchParams.get("site") === site);
          await page.waitForLoadState("networkidle");
          const name = await page.locator('select[name="site"] option:checked').textContent();
          assert.ok((await page.locator("main h2").first().textContent()).includes(name));
          assert.equal(await graph.locator("circle").count(), expectedDots(site, "baseline"));
          await page.locator('select[name="model"]').selectOption("transfer");
          await page.locator('form[method="get"] button').click();
          await page.waitForURL(url => url.searchParams.get("model") === "transfer");
          await page.waitForLoadState("networkidle");
          assert.equal(await graph.locator("circle").count(), expectedDots(site, "transfer"));
          const other = locale === "ko" ? "en" : "ko";
          const language = page.locator(`a[lang="${other}"]`);
          const target = new URL(await language.getAttribute("href"), base);
          assert.equal(target.searchParams.get("site"), site);
          assert.equal(target.searchParams.get("date"), day);
          assert.equal(target.searchParams.get("model"), "transfer");
        }
        await page.getByRole("link", { name: messages.currentCurve, exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("signal") === "current");
        await page.waitForLoadState("networkidle");
        assert.ok(await graph.locator("path").count() > 0);
        await page.getByRole("link", { name: messages.tide, exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("signal") === "tide");
        await page.waitForLoadState("networkidle");
        assert.ok(await graph.locator("path").count() > 0);
        const detail = await page.locator('a[href*="/sites/mikes-point"]').getAttribute("href");
        await page.goto(new URL(detail, base).href, { waitUntil: "networkidle" });
        assert.ok(await page.locator("main h1").textContent());
        assert.equal(await page.locator('select[name="site"]').inputValue(), "mikes-point");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: join(artifacts, `${locale}-${width}-detail.png`), fullPage: true });
        checks.push({ locale, width, observations: expectedObservations, sites: 19 });
        await page.close();
      }
    }
    const optionalIconErrors = errors.filter(error => typeof error === "object" && error.url === base + "/favicon.ico" && error.message === "Failed to load resource: the server responded with a status of 404 (Not Found)");
    const applicationErrors = errors.filter(error => !optionalIconErrors.includes(error));
    process.stdout.write(JSON.stringify({ release_id: pointer.release_id, day, checks, browser_errors: applicationErrors, optional_icon_errors: optionalIconErrors, resource_errors: resourceErrors }) + "\n");
    assert.deepEqual(applicationErrors, []);
    assert.deepEqual(resourceErrors, []);
  } finally { await browser.close(); }
});
