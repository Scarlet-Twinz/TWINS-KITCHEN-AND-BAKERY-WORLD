const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadCatalogue, readExistingRules, computeMediaState } = require('../validator');
const { discover, queryTerms, pageQuality, rankCandidate } = require('../discovery');
const { extractEvidence } = require('../discovery/extract');
const { matchProduct } = require('../discovery/matcher');
const { classifyMatch } = require('../discovery/scorer');
const { checkDuplicate } = require('../discovery/dedupe');
const { loadDiscoveryConfig } = require('../discovery/config');
const { SearchProvider, TavilySearchProvider, createSearchProvider } = require('../discovery/sources');

const DATA = path.join(__dirname, '..', '..', '..', 'data.js');

function html(title, image, name = title, model = '', capacity = '') {
  return '<html><head><title>' + title + '</title><meta property="og:title" content="' + title + '"><meta property="og:image" content="' + image + '"></head><body><script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name, model, image: [image] }) + '</script><h1>' + name + '</h1><p>' + model + ' ' + capacity + '</p></body></html>';
}

function provider(map) {
  return {
    name: 'fixture',
    async search(q) {
      return (map[q] || []).map(x => ({ ...x, provider: 'fixture' }));
    }
  };
}

function fetcher(pages) {
  return async url => pages[url]
    ? { ok: true, status: 200, url, text: async () => pages[url], headers: { get: () => 'text/html' } }
    : { ok: false, status: 404, url };
}

function fakeTavilyFetch(responseFactory) {
  return async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const body = JSON.parse(options.body);
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.query, 'commercial oven');
    assert.equal(body.max_results, 3);
    return responseFactory(body, options);
  };
}

test('dynamic pending detection and existing mappings', () => {
  const d = loadCatalogue();
  const s = computeMediaState(d, readExistingRules());
  assert.equal(s.counts.catalogue, 530);
  assert.equal(s.counts.verified, 226);
  assert.equal(s.pending.length, 304);
  assert.ok(s.valid.length);
});

test('query generation uses actual catalogue fields and future pending data', () => {
  const q = queryTerms({ id: 999, n: 'Test Oven', model: 'T20', capacity: '20L' });
  assert.ok(q.some(x => x.includes('Test Oven')));
  assert.ok(q.some(x => x.includes('T20')));
  assert.ok(q.some(x => x.includes('20L')));
});

test('query generation prioritizes exact product intent and includes available identity terms', () => {
  const q = queryTerms({ id: 999, n: 'Commercial Dishwasher', model: 'DW-500', capacity: '500L', spec: '3 phase' });
  assert.deepEqual(q.slice(0, 3), [
    '"Commercial Dishwasher" product',
    '"Commercial Dishwasher" manufacturer',
    '"Commercial Dishwasher" commercial equipment'
  ]);
  assert.ok(q[3].includes('"Commercial Dishwasher"'));
  assert.ok(q[3].includes('"DW-500"'));
  assert.ok(q[3].includes('"500L"'));
  assert.ok(q[3].includes('"3 phase"'));
});

test('candidate ranking prefers product-detail pages over generic category pages without changing classification thresholds', async () => {
  const state = {
    pending: [{ id: 999, n: 'Commercial Oven' }],
    counts: { catalogue: 1, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'Commercial Oven' }]]),
    blocklist: {}
  };
  const q = queryTerms(state.pending[0])[0];
  const category = 'https://fixture.example/category/commercial-ovens';
  const product = 'https://fixture.example/products/commercial-oven-model-x';
  const categoryImage = 'https://fixture.example/category-oven.jpg';
  const productImage = 'https://fixture.example/product-oven.jpg';
  const result = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 2, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: provider({ [q]: [
      { url: category, title: 'Commercial Oven Category' },
      { url: product, title: 'Commercial Oven Product' }
    ] }),
    fetchImpl: async url => {
      if (url === category) return { ok: true, status: 200, url, text: async () => html('Commercial Oven Category', categoryImage, 'Commercial Oven'), headers: { get: name => name === 'content-type' ? 'text/html' : null } };
      if (url === product) return { ok: true, status: 200, url, text: async () => html('Commercial Oven Product', productImage, 'Commercial Oven'), headers: { get: name => name === 'content-type' ? 'text/html' : null } };
      if (url === categoryImage || url === productImage) return { ok: true, status: 200, url, headers: { get: name => name === 'content-type' ? 'image/jpeg' : null } };
      return { ok: false, status: 404, url };
    },
    discoveredAt: '2026-09-22T00:00:00Z'
  });
  assert.equal(result.results[0].status, 'HIGH');
  assert.equal(result.results[0].candidate.sourceUrl, product);
  assert.ok(pageQuality({ url: product, title: 'Commercial Oven Product' }, result.results[0].evaluated.find(x => x.candidate.url === product).evidence) >
    pageQuality({ url: category, title: 'Commercial Oven Category' }, result.results[0].evaluated.find(x => x.candidate.url === category).evidence));
  assert.deepEqual(rankCandidate(result.results[0].evaluated.find(x => x.candidate.url === product)), [2, 10, 1]);
});

test('SearchProvider is provider-independent', async () => {
  const fixture = new SearchProvider('fixture');
  await assert.rejects(() => fixture.search('test'), /must be implemented/);
  const mock = provider({ test: [{ url: 'https://example.test/product', title: 'Product', snippet: 'Product snippet' }] });
  assert.deepEqual(await mock.search('test'), [{ url: 'https://example.test/product', title: 'Product', snippet: 'Product snippet', provider: 'fixture' }]);
});

test('Tavily provider normalizes BASIC results without internet', async () => {
  let requested = false;
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: fakeTavilyFetch(() => {
      requested = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              { url: 'https://example.test/product', title: 'Commercial Oven', content: 'Commercial bakery oven product.' },
              { url: '', title: 'ignored', content: 'missing URL' }
            ]
          };
        }
      };
    })
  });

  const result = await tavily.search('commercial oven', { count: 3, timeoutMs: 1000 });
  assert.equal(requested, true);
  assert.deepEqual(result, [{
    url: 'https://example.test/product',
    title: 'Commercial Oven',
    snippet: 'Commercial bakery oven product.',
    provider: 'tavily'
  }]);
});

test('Tavily normalized results reach downstream discovery evaluation', async () => {
  const page = 'https://fixture.example/tavily-product';
  const image = 'https://fixture.example/tavily-product.jpg';
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          results: [{ url: page, title: 'Commercial Oven', content: 'Commercial Oven product page' }]
        };
      }
    })
  });
  const state = {
    pending: [{ id: 999, n: 'Commercial Oven' }],
    counts: { catalogue: 1, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'Commercial Oven' }]]),
    blocklist: {}
  };
  const q = queryTerms(state.pending[0])[0];
  const result = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: tavily,
    fetchImpl: async url => {
      if (url === page) {
        return { ok: true, status: 200, url, text: async () => html('Commercial Oven', image, 'Commercial Oven'), headers: { get: name => name === 'content-type' ? 'text/html' : null } };
      }
      if (url === image) {
        return { ok: true, status: 200, url, headers: { get: name => name === 'content-type' ? 'image/jpeg' : null } };
      }
      return { ok: false, status: 404, url };
    },
    discoveredAt: '2026-09-22T00:00:00Z'
  });
  assert.equal(result.results[0].status, 'HIGH');
  assert.equal(result.results[0].candidate.sourceProvider, 'tavily');
  assert.equal(result.results[0].candidate.sourceUrl, page);
  assert.equal(result.results[0].candidate.imageUrl, image);
  assert.equal(result.results[0].evaluated.length, 1);
  assert.equal(result.results[0].evaluated[0].status, 'HIGH');
});

test('discovery preserves search provider errors instead of presenting them as empty evaluation', async () => {
  const state = {
    pending: [{ id: 999, n: 'Commercial Oven' }],
    counts: { catalogue: 1, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'Commercial Oven' }]]),
    blocklist: {}
  };
  const result = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: { name: 'tavily', async search() { throw Object.assign(new Error('Tavily search provider returned HTTP 401'), { status: 401 }); } },
    fetchImpl: async () => ({ ok: false, status: 500 }),
    discoveredAt: '2026-09-22T00:00:00Z'
  });
  assert.equal(result.results[0].status, 'UNRESOLVED');
  assert.equal(result.results[0].evaluated.length, 0);
  assert.equal(result.results[0].searchStages.length, 1);
  assert.equal(result.results[0].searchStages[0].query, queryTerms(state.pending[0])[0]);
  assert.equal(result.results[0].searchStages[0].status, 'ERROR');
  assert.equal(result.results[0].searchStages[0].error, 'Tavily search provider returned HTTP 401');
  assert.equal(result.results[0].searchStages[0].reason, 'Tavily search provider returned HTTP 401');
});

test('Tavily provider rejects non-empty responses whose URLs were all filtered out', async () => {
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: fakeTavilyFetch(() => ({
      ok: true,
      status: 200,
      async json() {
        return { results: [
          { title: 'Commercial Oven', content: 'result without URL' },
          { title: 'Another Oven', content: 'another result without URL' }
        ] };
      }
    }))
  });
  await assert.rejects(
    () => tavily.search('commercial oven', { count: 3 }),
    /results contained no usable URL fields/
  );
});

test('discovery records an explicit zero-result search stage instead of empty evaluation', async () => {
  const state = {
    pending: [{ id: 999, n: 'Commercial Oven' }],
    counts: { catalogue: 1, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'Commercial Oven' }]]),
    blocklist: {}
  };
  const result = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: { name: 'tavily', async search() { return []; } },
    fetchImpl: async () => ({ ok: false, status: 500 }),
    discoveredAt: '2026-09-22T00:00:00Z'
  });
  assert.equal(result.results[0].status, 'UNRESOLVED');
  assert.equal(result.results[0].evaluated.length, 0);
  assert.equal(result.results[0].searchStages.length, 1);
  assert.equal(result.results[0].searchStages[0].query, queryTerms(state.pending[0])[0]);
  assert.equal(result.results[0].searchStages[0].status, 'NO_RESULTS');
  assert.equal(result.results[0].searchStages[0].error, 'Search provider returned 0 results');
  assert.equal(result.results[0].searchStages[0].reason, 'Search provider returned 0 results');
});

test('Tavily provider returns empty results cleanly', async () => {
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: fakeTavilyFetch(() => ({ ok: true, status: 200, async json() { return { results: [] }; } }))
  });
  assert.deepEqual(await tavily.search('commercial oven', { count: 3 }), []);
});

test('Tavily provider rejects malformed responses', async () => {
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: fakeTavilyFetch(() => ({ ok: true, status: 200, async json() { return { result: [] }; } }))
  });
  await assert.rejects(() => tavily.search('commercial oven', { count: 3 }), /Malformed Tavily search response/);
});

test('Tavily provider surfaces HTTP/API errors', async () => {
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: fakeTavilyFetch(() => ({ ok: false, status: 429, async json() { return { error: 'rate limited' }; } }))
  });
  await assert.rejects(
    () => tavily.search('commercial oven', { count: 3 }),
    error => error.message === 'Tavily search provider returned HTTP 429' && error.status === 429
  );
});

test('Tavily provider handles timeout without internet', async () => {
  const tavily = new TavilySearchProvider({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      await new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
    timeoutMs: 10
  });
  await assert.rejects(() => tavily.search('commercial oven'), /timed out/);
});

test('provider selection chooses Tavily without making a request', () => {
  const config = loadDiscoveryConfig({
    MEDIA_SEARCH_PROVIDER: 'tavily',
    MEDIA_SEARCH_API_KEY: 'test-key'
  });
  assert.equal(config.provider, 'tavily');
  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.apiUrl, 'https://api.tavily.com/search');

  const providerInstance = createSearchProvider(config, {});
  assert.ok(providerInstance instanceof TavilySearchProvider);
});

test('provider selection can still choose Brave without changing its implementation', () => {
  const config = loadDiscoveryConfig({
    MEDIA_SEARCH_PROVIDER: 'brave',
    MEDIA_SEARCH_API_KEY: 'test-key'
  });
  assert.equal(config.apiUrl, 'https://api.search.brave.com/res/v1/web/search');
  assert.equal(createSearchProvider(config, {}).name, 'brave');
});

test('provider-independent downstream behavior uses the fixture provider', async () => {
  const state = {
    pending: [{ id: 999, n: 'Commercial Oven' }],
    counts: { catalogue: 1, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'Commercial Oven' }]]),
    blocklist: {}
  };
  const q = queryTerms(state.pending[0])[0];
  const page = 'https://fixture.example/product';
  const image = 'https://fixture.example/image.jpg';
  const result = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: provider({ [q]: [{ url: page, title: 'Commercial Oven', snippet: 'Commercial Oven' }] }),
    fetchImpl: async url => {
      if (url === page) {
        return { ok: true, status: 200, url, text: async () => html('Commercial Oven', image, 'Commercial Oven'), headers: { get: name => name === 'content-type' ? 'text/html' : null } };
      }
      if (url === image) {
        return { ok: true, status: 200, url, headers: { get: name => name === 'content-type' ? 'image/jpeg' : null } };
      }
      return { ok: false, status: 404, url };
    },
    discoveredAt: '2026-09-21T00:00:00Z'
  });
  assert.equal(result.results[0].status, 'HIGH');
  assert.equal(result.results[0].candidate.imageUrl, image);
  assert.equal(result.results[0].candidate.sourceProvider, 'fixture');
});

test('HIGH candidate', () => {
  const p = { n: 'Planetary Mixer 20L', model: 'B20', capacity: '20L' };
  const e = extractEvidence(html(p.n, 'https://cdn.example/m.jpg', p.n, p.model, p.capacity), 'https://example.test/p');
  assert.equal(classifyMatch(matchProduct(p, e), e).status, 'HIGH');
});

test('REVIEW candidate', () => {
  const p = { n: 'Commercial Chest Freezer - Large' };
  const e = extractEvidence(html('Commercial Chest Freezer', 'https://cdn.example/f.jpg', 'Commercial Chest Freezer'), 'https://example.test/p');
  assert.equal(classifyMatch(matchProduct(p, e), e).status, 'REVIEW');
});

test('UNRESOLVED candidate', () => {
  const p = { n: 'Planetary Mixer 20L', capacity: '20L' };
  const e = extractEvidence(html('Office Chair', 'https://cdn.example/c.jpg', 'Office Chair'), 'https://example.test/p');
  assert.equal(classifyMatch(matchProduct(p, e), e).status, 'UNRESOLVED');
});

test('duplicate and fabricated URL rejection', () => {
  assert.equal(checkDuplicate('https://EXAMPLE.test:443/a.jpg#x', new Set(['https://example.test/a.jpg']), new Set()).ok, false);
  assert.equal(checkDuplicate('https://example.test/a.jpg', new Set(), new Set(['https://example.test/a.jpg'])).ok, false);
  assert.equal(checkDuplicate('not-a-url', new Set(), new Set()).ok, false);
});

test('fabricated evidence is not accepted', () => {
  const e = extractEvidence('<html><head><title>Empty</title></head><body></body></html>', 'https://example.test/p');
  assert.equal(e.fields.name, undefined);
  assert.equal(e.images.length, 0);
});

test('inaccessible source becomes UNRESOLVED', async () => {
  const state = { pending: [{ id: 1, n: 'Unavailable Product' }], counts: { catalogue: 1, pending: 1 }, resolved: [], byId: new Map(), blocklist: {} };
  const r = await discover({
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: { name: 'fixture', async search() { return [{ url: 'https://example.test/blocked' }]; } },
    fetchImpl: async () => ({ ok: false, status: 403 }),
    discoveredAt: '2026-09-21T00:00:00Z'
  });
  assert.equal(r.results[0].status, 'UNRESOLVED');
  assert.equal(r.results[0].evaluated[0].error, 'forbidden');
});

test('discovery does not mutate data.js and preserves legacy duplicates', async () => {
  const before = fs.readFileSync(DATA, 'utf8');
  const d = loadCatalogue(), s = computeMediaState(d, readExistingRules());
  const values = d.rawIdPairs.map(x => x[1]);
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  assert.ok([...counts.values()].some(x => x > 1));
  const p = s.pending[0], q = queryTerms(p)[0], page = 'https://fixture.example/p', img = 'https://fixture.example/i.jpg';
  await discover({
    state: { ...s, pending: [p] },
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: provider({ [q]: [{ url: page }] }),
    fetchImpl: fetcher({ [page]: html(p.n, img) }),
    discoveredAt: '2026-09-21T00:00:00Z'
  });
  assert.equal(fs.readFileSync(DATA, 'utf8'), before);
});

test('deterministic rerun and newly added pending product', async () => {
  const state = {
    pending: [{ id: 999, n: 'New Pending Product' }],
    counts: { catalogue: 531, pending: 1 },
    resolved: [],
    byId: new Map([['999', { id: 999, n: 'New Pending Product' }]]),
    blocklist: {}
  };
  const q = queryTerms(state.pending[0])[0], page = 'https://fixture.example/new', img = 'https://fixture.example/new.jpg';
  const opts = {
    state,
    config: { concurrency: 1, maxQueriesPerProduct: 1, maxResultsPerQuery: 1, timeoutMs: 10, retries: 0, retryBackoffMs: 0, requestsPerSecond: 100 },
    provider: provider({ [q]: [{ url: page }] }),
    fetchImpl: fetcher({ [page]: html('New Pending Product', img) }),
    discoveredAt: '2026-09-21T00:00:00Z'
  };
  const a = await discover(opts), b = await discover(opts);
  assert.deepEqual(a, b);
  assert.equal(a.results[0].productId, '999');
});
