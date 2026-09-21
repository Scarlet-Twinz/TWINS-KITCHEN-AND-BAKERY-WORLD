class SearchProvider {
  constructor(name) { this.name = name || 'unknown'; }
  async search() { throw new Error('SearchProvider.search() must be implemented'); }
}

class BraveSearchProvider extends SearchProvider {
  constructor(options = {}) {
    super('brave');
    this.apiKey = options.apiKey || process.env.MEDIA_SEARCH_API_KEY || '';
    this.endpoint = options.apiUrl || process.env.MEDIA_SEARCH_API_URL || 'https://api.search.brave.com/res/v1/web/search';
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async search(query, options = {}) {
    if (!this.apiKey) throw new Error('MEDIA_SEARCH_API_KEY is required for the Brave search provider');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const u = new URL(this.endpoint);
      u.searchParams.set('q', query);
      u.searchParams.set('count', String(options.count || 5));
      const r = await this.fetchImpl(u, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
        signal: controller.signal
      });
      if (!r.ok) {
        const e = new Error('Search provider returned HTTP ' + r.status);
        e.status = r.status;
        throw e;
      }
      const body = await r.json();
      const rows = Array.isArray(body.web && body.web.results) ? body.web.results : [];
      return rows.map(x => ({
        url: typeof x.url === 'string' ? x.url : '',
        title: typeof x.title === 'string' ? x.title : '',
        snippet: typeof x.description === 'string' ? x.description : '',
        provider: this.name
      })).filter(x => x.url);
    } finally {
      clearTimeout(timer);
    }
  }
}

class TavilySearchProvider extends SearchProvider {
  constructor(options = {}) {
    super('tavily');
    this.apiKey = options.apiKey || process.env.MEDIA_SEARCH_API_KEY || '';
    this.endpoint = options.apiUrl || process.env.MEDIA_SEARCH_API_URL || 'https://api.tavily.com/search';
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async search(query, options = {}) {
    if (!this.apiKey) throw new Error('MEDIA_SEARCH_API_KEY is required for the Tavily search provider');
    if (typeof this.fetchImpl !== 'function') throw new Error('fetch is unavailable for the Tavily search provider');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      let response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.apiKey
          },
          body: JSON.stringify({
            query,
            search_depth: 'basic',
            max_results: options.count || 5
          }),
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Tavily search request timed out');
        throw error;
      }

      if (!response.ok) {
        const error = new Error('Tavily search provider returned HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }

      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error('Malformed Tavily search response: invalid JSON');
      }

      if (!body || typeof body !== 'object' || !Array.isArray(body.results)) {
        throw new Error('Malformed Tavily search response: results array is missing');
      }

      return body.results
        .map(result => ({
          url: typeof result?.url === 'string' ? result.url : '',
          title: typeof result?.title === 'string' ? result.title : '',
          snippet: typeof result?.content === 'string' ? result.content : '',
          provider: this.name
        }))
        .filter(result => result.url);
    } finally {
      clearTimeout(timer);
    }
  }
}

function createSearchProvider(config, overrides = {}) {
  const name = String(config.provider || 'brave').toLowerCase();
  if (overrides[name]) return overrides[name];
  if (name === 'brave') return new BraveSearchProvider(config);
  if (name === 'tavily') return new TavilySearchProvider(config);
  throw new Error('Unsupported MEDIA_SEARCH_PROVIDER: ' + name);
}

module.exports = { SearchProvider, BraveSearchProvider, TavilySearchProvider, createSearchProvider };
