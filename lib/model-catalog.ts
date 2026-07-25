export interface ModelCatalogCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelCatalogEntry {
  key: string;
  providerId: string;
  providerName: string;
  id: string;
  name: string;
  cost: ModelCatalogCost;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCost(value: unknown): ModelCatalogCost | null {
  if (!isRecord(value)) return null;
  const cost: ModelCatalogCost = {
    input: optionalNumber(value.input),
    output: optionalNumber(value.output),
    cacheRead: optionalNumber(value.cache_read),
    cacheWrite: optionalNumber(value.cache_write),
  };
  return Object.values(cost).some((entry) => entry !== undefined) ? cost : null;
}

export function flattenModelsDevCatalog(value: unknown): ModelCatalogEntry[] {
  if (!isRecord(value)) return [];

  const entries: ModelCatalogEntry[] = [];
  for (const [providerId, rawProvider] of Object.entries(value)) {
    if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue;
    const providerName = typeof rawProvider.name === "string" && rawProvider.name.trim()
      ? rawProvider.name.trim()
      : providerId;

    for (const [fallbackId, rawModel] of Object.entries(rawProvider.models)) {
      if (!isRecord(rawModel)) continue;
      const id = typeof rawModel.id === "string" && rawModel.id.trim()
        ? rawModel.id.trim()
        : fallbackId;
      if (!id) continue;
      const cost = readCost(rawModel.cost);
      if (!cost) continue;
      const name = typeof rawModel.name === "string" && rawModel.name.trim()
        ? rawModel.name.trim()
        : id;
      entries.push({
        key: `${providerId}/${id}`,
        providerId,
        providerName,
        id,
        name,
        cost,
      });
    }
  }

  return entries;
}

function matchRank(entry: ModelCatalogEntry, query: string, providerHint: string): number {
  const id = entry.id.toLocaleLowerCase();
  const name = entry.name.toLocaleLowerCase();
  const providerId = entry.providerId.toLocaleLowerCase();
  const providerName = entry.providerName.toLocaleLowerCase();
  const fullId = `${providerId}/${id}`;

  let rank = 20;
  if (!query) rank = 10;
  else if (id === query || fullId === query) rank = 0;
  else if (name === query) rank = 1;
  else if (id.startsWith(query) || name.startsWith(query)) rank = 2;
  else if (fullId.startsWith(query) || providerId === query || providerName === query) rank = 3;
  else if (id.includes(query) || name.includes(query)) rank = 4;
  else if (fullId.includes(query) || providerName.includes(query)) rank = 5;

  if (rank < 20 && providerHint && (providerId === providerHint || providerName === providerHint)) rank -= 0.5;
  return rank;
}

export function searchModelCatalog(
  entries: readonly ModelCatalogEntry[],
  query: string,
  providerHint = "",
  limit = 50,
): ModelCatalogEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedProvider = providerHint.trim().toLocaleLowerCase();
  const cappedLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50));

  return entries
    .map((entry) => ({ entry, rank: matchRank(entry, normalizedQuery, normalizedProvider) }))
    .filter(({ rank }) => !normalizedQuery || rank < 20)
    .sort((a, b) => a.rank - b.rank
      || a.entry.providerName.localeCompare(b.entry.providerName, undefined, { sensitivity: "base" })
      || a.entry.name.localeCompare(b.entry.name, undefined, { numeric: true, sensitivity: "base" })
      || a.entry.id.localeCompare(b.entry.id, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, cappedLimit)
    .map(({ entry }) => entry);
}
