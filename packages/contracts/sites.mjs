import sites from "./data/sites.json" with { type: "json" };

const byId = new Map(sites.map((site) => [site.id, site]));
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
const byName = new Map(sites.flatMap((site) => [[normalize(site.name_en), site], [normalize(site.name_ko), site]]));

export { sites };

export function resolveSiteId(value) {
  if (typeof value !== "string") return null;
  return byId.get(value)?.id ?? byName.get(normalize(value))?.id ?? null;
}
