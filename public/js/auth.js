/**
 * ============================================================
 *  js/auth.js - who is logged in, and to which shop
 * ============================================================
 *  Same method names as your old auth.js, so nothing that calls
 *  Auth.getCurrentUser() or Auth.requireRole() had to change.
 *
 *  What changed: passwords are no longer checked in the browser.
 *  The server checks them against a bcrypt hash and hands back a
 *  token. The old version compared plain text in JavaScript, which
 *  meant anyone could open the console and read every password.
 * ============================================================
 */

const Auth = {

  SESSION_KEY: 'quickmart_session',

  /**
   * Log in. Returns the user on success, throws with a readable
   * message on failure.
   *
   * @param {string} identifier - the staff member's email OR username
   * @param {string} password
   * @param {string} shopCode - only needed if the same login is
   *                            registered at more than one shop
   */
  async login(identifier, password, shopCode) {
    const result = await API.auth.login({ identifier, password, shopCode });

    API.setToken(result.token);
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      ...result.user,
      loginTime: new Date().toISOString()
    }));

    return result.user;
  },

  /**
   * Register a brand new shop. The owner is logged in straight away.
   */
  async register(details) {
    const result = await API.auth.register(details);

    API.setToken(result.token);
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      ...result.user,
      shopId:   result.shop.id,
      shopName: result.shop.name,
      shopCode: result.shop.shopCode,
      loginTime: new Date().toISOString()
    }));

    return result;
  },

  async logout() {
    // Tell the server first, so the shop owner's Staff Activity
    // report shows a real leaving time. If this fails - no network,
    // expired token - the logout still goes ahead: being unable to
    // reach the server must never trap someone in the app. The
    // session's last_seen_at then stands as their end time.
    try {
      await API.auth.logout();
    } catch (error) {
      console.warn('Could not record the logout time:', error.message);
    }

    API.clearToken();
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem('quickmart_shop');
    window.location.href = 'index.html';
  },

  getCurrentUser() {
    const data = localStorage.getItem(this.SESSION_KEY);
    return data ? JSON.parse(data) : null;
  },

  isLoggedIn() {
    return this.getCurrentUser() !== null && API.getToken() !== null;
  },

  /**
   * Block the page if the user has the wrong role.
   *
   * The old version only looked at the browser's own session, which
   * anyone could edit. This one still does the quick local check
   * (so the page doesn't flash before redirecting), but the server
   * checks the role again on every single request. The browser
   * check is for convenience; the server check is the real one.
   */
  requireRole(role) {
    const user = this.getCurrentUser();

    if (!user || !API.getToken()) {
      window.location.href = 'index.html';
      return false;
    }

    const allowed = Array.isArray(role) ? role : [role];

    // Owners can go anywhere in their own shop
    if (user.role === 'owner') {
      return true;
    }

    if (!allowed.includes(user.role)) {
      alert('You do not have permission to open that page.');
      window.location.href = this.homePageFor(user.role);
      return false;
    }

    return true;
  },

  /**
   * Which page does this role land on after login?
   */
  homePageFor(role) {
    if (role === 'cashier')   return 'cashier.html';
    if (role === 'inventory') return 'inventory.html';
    return 'admin.html';      // owner and admin
  },

  getSessionInfo() {
    const session = this.getCurrentUser();
    if (!session) return null;

    const minutes = Math.floor((new Date() - new Date(session.loginTime)) / 60000);

    return {
      ...session,
      durationMins: minutes,
      durationText: `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    };
  }
};
