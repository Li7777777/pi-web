import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  try {
    const { createJiti } = await import("jiti");
    return createJiti(import.meta.url).import("./model-catalog.ts");
  } catch {
    return import("./model-catalog.ts");
  }
}

const { flattenModelsDevCatalog, searchModelCatalog } = await loadSubject();

const catalog = flattenModelsDevCatalog({
  openai: {
    name: "OpenAI",
    models: {
      "gpt-5": {
        id: "gpt-5",
        name: "GPT-5",
        cost: { input: 1.25, output: 10, cache_read: 0.125 },
      },
    },
  },
  openrouter: {
    name: "OpenRouter",
    models: {
      "openai/gpt-5": {
        id: "openai/gpt-5",
        name: "GPT-5 via OpenRouter",
        cost: { input: 1.3, output: 10.5, cache_write: 2 },
      },
      "missing-price": { id: "missing-price", name: "No Price" },
    },
  },
});

test("flattens models.dev pricing fields", () => {
  assert.deepEqual(catalog[0], {
    key: "openai/gpt-5",
    providerId: "openai",
    providerName: "OpenAI",
    id: "gpt-5",
    name: "GPT-5",
    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: undefined },
  });
  assert.equal(catalog.length, 2);
});

test("ranks exact model IDs and provider hints first", () => {
  assert.equal(searchModelCatalog(catalog, "gpt-5", "openai")[0].providerId, "openai");
  assert.equal(searchModelCatalog(catalog, "openai/gpt-5", "openrouter")[0].providerId, "openrouter");
});
