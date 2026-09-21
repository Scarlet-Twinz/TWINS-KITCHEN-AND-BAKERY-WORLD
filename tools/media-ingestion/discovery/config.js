const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const TAVILY_API_URL = 'https://api.tavily.com/search';

const DEFAULTS = {
  provider: 'brave',
  apiUrl: BRAVE_API_URL,
  concurrency: 3,
  maxQueriesPerProduct: 4,
  maxResultsPerQuery: 5,
  timeoutMs: 10000,
  retries: 2,
  retryBackoffMs: 500,
  requestsPerSecond: 2,
  maxProducts: 0
};

function intEnv(name, fallback, min = 0) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function loadDiscoveryConfig(env = process.env) {
  const provider = String(env.MEDIA_SEARCH_PROVIDER || DEFAULTS.provider).toLowerCase();
  const defaultApiUrl = provider === 'tavily' ? TAVILY_API_URL : DEFAULTS.apiUrl;

  return {
    provider,
    apiKey: env.MEDIA_SEARCH_API_KEY || '',
    apiUrl: env.MEDIA_SEARCH_API_URL || defaultApiUrl,
    concurrency: intEnv('MEDIA_DISCOVERY_CONCURRENCY', 3, 1),
    maxQueriesPerProduct: intEnv('MEDIA_DISCOVERY_MAX_QUERIES_PER_PRODUCT', 4, 1),
    maxResultsPerQuery: intEnv('MEDIA_DISCOVERY_MAX_RESULTS_PER_QUERY', 5, 1),
    timeoutMs: intEnv('MEDIA_DISCOVERY_TIMEOUT_MS', 10000, 100),
    retries: intEnv('MEDIA_DISCOVERY_RETRIES', 2, 0),
    retryBackoffMs: intEnv('MEDIA_DISCOVERY_RETRY_BACKOFF_MS', 500, 0),
    requestsPerSecond: intEnv('MEDIA_DISCOVERY_REQUESTS_PER_SECOND', 2, 1),
    maxProducts: intEnv('MEDIA_DISCOVERY_MAX_PRODUCTS', 0, 0)
  };
}

module.exports = { BRAVE_API_URL, TAVILY_API_URL, DEFAULTS, loadDiscoveryConfig };
