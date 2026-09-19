/**
 * ============================================================
 *  js/api.js - every conversation with the server goes through here
 * ============================================================
 *  Before, your pages read straight from localStorage. Now they
 *  ask the server, and the server checks who you are and which
 *  shop you belong to before answering.
 *
 *  This file is the only place that knows about fetch(), tokens
 *  and URLs. Everything else just calls API.products.list().
 * ============================================================
 */

const API = {

  /**
   * Where the server lives.
   * Empty string means "same address as this page", which is what
   * you want when the server serves the app (http://localhost:4000).
   * If you ever host the app separately, put the full URL here,
   * e.g. 'https://api.quickmart.com'.
   */
  BASE_URL: '',

  TOKEN_KEY: 'quickmart_token',

  // ── Token storage ────────────────────────────────────────
  //  localStorage, not sessionStorage, so a cashier who closes
  //  the tab by mistake is not thrown out mid-shift.

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  /**
   * The workhorse. Every other function in this file calls it.
   *
   * @param {string} path   - e.g. '/api/products'
   * @param {object} options- { method, body, isForm }
   */
  async request(path, options = {}) {
    const headers = {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body = options.body;

    // FormData (file uploads) sets its own Content-Type, so don't touch it
    if (body && !options.isForm) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    let response;

    try {
      response = await fetch(this.BASE_URL + path, {
        method: options.method || 'GET',
        headers,
        body
      });
    } catch (networkError) {
      throw new Error('Cannot reach the server. Check your internet connection.');
    }

    // CSV download and other non-JSON replies
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      if (!response.ok) throw new Error('Request failed.');
      return response;
    }

    const data = await response.json();

    if (!response.ok) {
      // Session gone? Send them back to the login screen.
      if (response.status === 401) {
        this.clearToken();
        if (!location.pathname.endsWith('index.html') && location.pathname !== '/') {
          location.href = 'index.html';
        }
      }
      throw new Error(data.message || 'Something went wrong.');
    }

    return data;
  },

  get(path)         { return this.request(path); },
  post(path, body)  { return this.request(path, { method: 'POST', body }); },
  put(path, body)   { return this.request(path, { method: 'PUT', body }); },
  del(path)         { return this.request(path, { method: 'DELETE' }); },


  // ══════════════════════════════════════════════════════════
  //  Grouped by what they deal with, so the calls read plainly
  // ══════════════════════════════════════════════════════════

  auth: {
    register(details)      { return API.post('/api/auth/register', details); },
    login(credentials)     { return API.post('/api/auth/login', credentials); },
    logout()               { return API.post('/api/auth/logout', {}); },
    me()                   { return API.get('/api/auth/me'); },
    changePassword(body)   { return API.post('/api/auth/password', body); }
  },

  shop: {
    get()                  { return API.get('/api/shop'); },
    update(details)        { return API.put('/api/shop', details); },
    receiptSettings()      { return API.get('/api/shop/receipt-settings'); },
    uploadLogo(file) {
      const form = new FormData();
      form.append('logo', file);
      return API.request('/api/shop/logo', { method: 'POST', body: form, isForm: true });
    }
  },

  categories: {
    list()                 { return API.get('/api/categories'); },
    create(category)       { return API.post('/api/categories', category); },
    update(id, category)   { return API.put('/api/categories/' + id, category); },
    remove(id)             { return API.del('/api/categories/' + id); },
    uploadImage(id, file) {
      const form = new FormData();
      form.append('image', file);
      return API.request('/api/categories/' + id + '/image',
        { method: 'POST', body: form, isForm: true });
    },
    removeImage(id)        { return API.del('/api/categories/' + id + '/image'); }
  },

  products: {
    list(filters = {}) {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      const qs = params.toString();
      return API.get('/api/products' + (qs ? '?' + qs : ''));
    },
    byBarcode(code)        { return API.get('/api/products/barcode/' + encodeURIComponent(code)); },
    lowStock()             { return API.get('/api/products/low-stock'); },
    allMovements()         { return API.get('/api/products/movements'); },
    create(product)        { return API.post('/api/products', product); },
    update(id, product)    { return API.put('/api/products/' + id, product); },
    remove(id)             { return API.del('/api/products/' + id); },
    adjustStock(id, body)  { return API.post('/api/products/' + id + '/stock', body); },
    movements(id)          { return API.get('/api/products/' + id + '/movements'); }
  },

  sales: {
    create(sale)           { return API.post('/api/sales', sale); },
    list(filters = {}) {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] && filters[key] !== 'all') params.append(key, filters[key]);
      });
      const qs = params.toString();
      return API.get('/api/sales' + (qs ? '?' + qs : ''));
    },
    get(id)                { return API.get('/api/sales/' + id); },
    receipt(id)            { return API.get('/api/sales/' + id + '/receipt'); },
    void(id, reason)       { return API.post('/api/sales/' + id + '/void', { reason }); }
  },

  users: {
    list()                 { return API.get('/api/users'); },
    create(user)           { return API.post('/api/users', user); },
    update(id, user)       { return API.put('/api/users/' + id, user); },
    remove(id)             { return API.del('/api/users/' + id); }
  },

  subscription: {
    plans()                { return API.get('/api/subscription/plans'); },
    current()              { return API.get('/api/subscription'); },
    subscribe(body)        { return API.post('/api/subscription/subscribe', body); },
    payments()             { return API.get('/api/subscription/payments'); }
  },

  reports: {
    dashboard()            { return API.get('/api/reports/dashboard'); },
    salesTrend(days = 7)   { return API.get('/api/reports/sales-trend?days=' + days); },
    topProducts(limit = 5) { return API.get('/api/reports/top-products?limit=' + limit); },
    profit(range = {})     {
      const params = new URLSearchParams(range).toString();
      return API.get('/api/reports/profit' + (params ? '?' + params : ''));
    },
    cashiers(range = {})   {
      const params = new URLSearchParams(range).toString();
      return API.get('/api/reports/cashiers' + (params ? '?' + params : ''));
    },
    mySales(date)          {
      return API.get('/api/reports/my-sales' + (date ? '?date=' + date : ''));
    },
    cashierSales(userId, date) {
      return API.get('/api/reports/cashier-sales?userId=' + userId + (date ? '&date=' + date : ''));
    },
    staffActivity(date)    {
      return API.get('/api/reports/staff-activity' + (date ? '?date=' + date : ''));
    }
  }
};
