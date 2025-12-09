require('dotenv').config();

const axios = require('axios');

/**
 * Cliente genérico apenas para consulta (GET) em APIs REST
 */
class ApiClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || '';
    this.defaultHeaders = config.headers || {};
    this.defaultToken = config.token || '';
    this.tokenHeader = config.tokenHeader || 'Authorization';
    this.tokenPrefix = config.tokenPrefix || 'Bearer';
    this.timeout = config.timeout || 30000;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        ...this.defaultHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: this.timeout
    });

    if (this.defaultToken) {
      this.setToken(this.defaultToken);
    }

    this.client.interceptors.response.use(
      response => response,
      error => {
        const errorMessage = error.response?.data?.message || error.message;
        const status = error.response?.status;
        console.error(`API Error [${status || 'N/A'}]:`, errorMessage);
        return Promise.reject(error);
      }
    );
  }

  setToken(token) {
    if (token) {
      this.client.defaults.headers.common[this.tokenHeader] = 
        `${this.tokenPrefix} ${token}`;
    }
  }

  removeToken() {
    delete this.client.defaults.headers.common[this.tokenHeader];
  }

  async get(endpoint, config = {}) {
    try {
      const response = await this.client.get(endpoint, config);
      return response.data;
    } catch (error) {
      throw this._formatError(error, 'GET', endpoint);
    }
  }

  async getAllPaginated(endpoint, options = {}, config = {}) {
    const {
      pageParam = 'page',
      perPageParam = 'per_page',
      perPage = 100,
      maxPages = 10,
      getNextPage = null
    } = options;

    let allResults = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const params = {
        ...config.params,
        [pageParam]: page,
        [perPageParam]: perPage
      };

      const response = await this.get(endpoint, { ...config, params });
      
      if (typeof getNextPage === 'function') {
        const { data, hasNextPage } = getNextPage(response, page);
        allResults = allResults.concat(data);
        hasMore = hasNextPage;
      } else {
        const data = Array.isArray(response) ? response : response.data || response.items || [];
        allResults = allResults.concat(data);
        hasMore = data.length === perPage;
      }

      page++;
    }
    return allResults;
  }

  _formatError(error, method, endpoint) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const message = error.response?.data?.message || error.message;
    const url = `${this.baseURL}${endpoint}`;

    return {
      method,
      url,
      status,
      statusText,
      message,
      originalError: error
    };
  }
}

/**
 * Factory para criar cliente da API do GitHub
 */
function createGitHubClient(token = null) {
  const githubToken = token || process.env.GITHUB_TOKEN || '';
  
  return new ApiClient({
    baseURL: 'https://api.github.com',
    token: githubToken,
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'github-api-client'
    }
  });
}

// Cliente padrão do GitHub
const githubClient = createGitHubClient();

// Exportar apenas o cliente e a classe genérica
module.exports = githubClient;
module.exports.ApiClient = ApiClient;
module.exports.createGitHubClient = createGitHubClient;
module.exports.username = process.env.GITHUB_USERNAME || 'Darchu067';
module.exports.token = process.env.GITHUB_TOKEN || '';

