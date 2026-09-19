/**
 * ============================================================
 *  js/db.js - the bridge between your old code and the server
 * ============================================================
 *  Your old db.js kept everything in localStorage. This one
 *  keeps the SAME method names (DB.getAll, DB.getById, DB.add,
 *  DB.update, DB.delete, DB.query) so admin.js, cashier.js and
 *  inventory.js barely had to change.
 *
 *  What changed underneath:
 *
 *    READING  - on page load we fetch this shop's data once and
 *               hold it in memory. DB.getAll() then returns
 *               instantly, exactly like before.
 *
 *    WRITING  - DB.add / update / delete now send the change to
 *               the server and wait for it. That means those
 *               three are "await" calls now.
 *
 *  The server speaks in database column names (min_stock,
 *  receipt_no, sale_date). Your pages speak in camelCase
 *  (minStock, receiptNo, date). The translation happens here,
 *  in the toApp/toServer functions, so neither side has to change.
 * ============================================================
 */

const DB = {

  // The in-memory copy of this shop's data
  cache: {
    products:       [],
    categories:     [],
    sales:          [],
    users:          [],
    stockMovements: []
  },

  ready: false,


  // ══════════════════════════════════════════════════════════
  //  TRANSLATION - server column names <-> app property names
  // ══════════════════════════════════════════════════════════

  toApp: {
    product(row) {
      return {
        id:         row.id,
        name:       row.name,
        category:   row.category_name || 'Uncategorised',
        categoryId: row.category_id,
        price:      Number(row.price),
        costPrice:  Number(row.cost_price || 0),
        barcode:    row.barcode,
        stock:      Number(row.stock),
        minStock:   Number(row.min_stock),
        unit:       row.unit
      };
    },

    sale(row) {
      return {
        id:            row.id,
        receiptNo:     row.receipt_no,
        items: (row.items || []).map(item => ({
          productId: item.product_id,
          name:      item.product_name,
          price:     Number(item.unit_price),
          quantity:  Number(item.quantity),
          subtotal:  Number(item.subtotal)
        })),
        subtotal:      Number(row.subtotal),
        tax:           Number(row.tax_amount),
        discount:      Number(row.discount || 0),
        total:         Number(row.total),
        paymentMethod: row.payment_method,
        amountPaid:    Number(row.amount_paid),
        change:        Number(row.change_amount),
        cashierName:   row.cashier_name,
        momoProvider:  row.momo_provider,
        momoNumber:    row.momo_number,
        status:        row.status,
        date:          row.sale_date
      };
    },

    user(row) {
      return {
        id:        row.id,
        name:      row.name,
        email:     row.email,
        username:  row.username,
        phone:     row.phone,
        role:      row.role,
        status:    row.status,
        lastLogin: row.last_login_at,
        password:  ''            // never sent to the browser
      };
    },

    movement(row) {
      return {
        id:            row.id,
        productId:     row.product_id,
        productName:   row.product_name,
        type:          row.movement_type,
        quantity:      Number(row.quantity),
        previousStock: Number(row.previous_stock),
        newStock:      Number(row.new_stock),
        reason:        row.reason,
        performedBy:   row.performed_name,
        date:          row.movement_date
      };
    }
  },

  toServer: {
    product(record) {
      // The app stores category as a name; the server wants an id
      let categoryId = record.categoryId;

      if (!categoryId && record.category) {
        const match = DB.cache.categories.find(c => c.name === record.category);
        categoryId = match ? match.id : null;
      }

      return {
        name:       record.name,
        categoryId: categoryId || null,
        barcode:    record.barcode,
        costPrice:  record.costPrice,
        price:      record.price,
        stock:      record.stock,
        minStock:   record.minStock,
        unit:       record.unit
      };
    },

    user(record) {
      return {
        name:     record.name,
        email:    record.email,
        username: record.username,
        phone:    record.phone,
        password: record.password,
        role:     record.role
      };
    }
  },


  // ══════════════════════════════════════════════════════════
  //  LOADING
  // ══════════════════════════════════════════════════════════

  /**
   * Fetch this shop's data and fill the cache.
   *
   * IMPORTANT: this is now asynchronous, so pages call it with
   *   await DB.init();
   *
   * Only loads what the logged-in role is allowed to see, so a
   * cashier doesn't pull down the staff list.
   */
  async init() {
    const role = Auth.getCurrentUser() ? Auth.getCurrentUser().role : null;

    const jobs = [
      API.categories.list().then(rows => { this.cache.categories = rows; }),
      API.products.list({ limit: 200 }).then(rows => {
        this.cache.products = rows.map(this.toApp.product);
      })
    ];

    if (role === 'owner' || role === 'admin' || role === 'cashier') {
      jobs.push(
        API.sales.list({ limit: 200 }).then(rows => {
          this.cache.sales = rows.map(this.toApp.sale);
        })
      );
    }

    if (role === 'owner' || role === 'admin') {
      jobs.push(
        API.users.list().then(rows => { this.cache.users = rows.map(this.toApp.user); })
      );
    }

    if (role === 'owner' || role === 'admin' || role === 'inventory') {
      jobs.push(
        API.products.allMovements().then(rows => {
          this.cache.stockMovements = rows.map(this.toApp.movement);
        })
      );
    }

    await Promise.all(jobs);
    this.ready = true;
    return this.cache;
  },

  /**
   * Re-fetch one table. Called after a write so the screen matches
   * the database rather than what we hoped happened.
   */
  async refresh(table) {
    if (table === 'products') {
      const rows = await API.products.list({ limit: 200 });
      this.cache.products = rows.map(this.toApp.product);
    } else if (table === 'sales') {
      const rows = await API.sales.list({ limit: 200 });
      this.cache.sales = rows.map(this.toApp.sale);
    } else if (table === 'users') {
      const rows = await API.users.list();
      this.cache.users = rows.map(this.toApp.user);
    } else if (table === 'categories') {
      this.cache.categories = await API.categories.list();
    } else if (table === 'stockMovements') {
      const rows = await API.products.allMovements();
      this.cache.stockMovements = rows.map(this.toApp.movement);
    }

    return this.cache[table];
  },


  // ══════════════════════════════════════════════════════════
  //  READING - unchanged signatures, still instant
  // ══════════════════════════════════════════════════════════

  getAll(table) {
    return this.cache[table] || [];
  },

  getById(table, id) {
    // Ids from the server are numbers, ids from the DOM are strings
    return (this.cache[table] || []).find(r => String(r.id) === String(id)) || null;
  },

  query(table, filterFn) {
    return (this.cache[table] || []).filter(filterFn);
  },


  // ══════════════════════════════════════════════════════════
  //  WRITING - these are now "await" calls
  // ══════════════════════════════════════════════════════════

  async add(table, record) {
    if (table === 'products') {
      const result = await API.products.create(this.toServer.product(record));
      await this.refresh('products');
      return this.getById('products', result.id);
    }

    if (table === 'users') {
      const result = await API.users.create(this.toServer.user(record));
      await this.refresh('users');
      return this.getById('users', result.id);
    }

    if (table === 'categories') {
      const result = await API.categories.create({ name: record.name, icon: record.icon });
      await this.refresh('categories');
      return result;
    }

    // Sales and stock movements are created by their own endpoints
    // (POST /api/sales and POST /api/products/:id/stock), because the
    // server has to cut stock and write the audit trail in one go.
    throw new Error(`DB.add does not handle "${table}" - use the API directly.`);
  },

  async update(table, id, data) {
    if (table === 'products') {
      // A bare { stock: n } update means a stock adjustment
      if (Object.keys(data).length === 1 && data.stock !== undefined) {
        await API.products.adjustStock(id, {
          type: 'adjustment',
          quantity: data.stock,
          reason: 'Manual correction'
        });
      } else {
        await API.products.update(id, this.toServer.product(data));
      }

      await this.refresh('products');
      return this.getById('products', id);
    }

    if (table === 'users') {
      const payload = {};
      if (data.name)     payload.name = data.name;
      if (data.email)    payload.email = data.email;
      if (data.phone)    payload.phone = data.phone;
      if (data.role)     payload.role = data.role;
      if (data.status)   payload.status = data.status;
      if (data.password) payload.password = data.password;

      // Sent even when blank - that is how a username gets removed
      if (data.username !== undefined) payload.username = data.username;

      await API.users.update(id, payload);
      await this.refresh('users');
      return this.getById('users', id);
    }

    throw new Error(`DB.update does not handle "${table}".`);
  },

  async delete(table, id) {
    if (table === 'products') {
      await API.products.remove(id);
      await this.refresh('products');
      return true;
    }

    if (table === 'users') {
      await API.users.remove(id);
      await this.refresh('users');
      return true;
    }

    if (table === 'categories') {
      await API.categories.remove(id);
      await this.refresh('categories');
      return true;
    }

    throw new Error(`DB.delete does not handle "${table}".`);
  },


  // ══════════════════════════════════════════════════════════
  //  HELPERS kept for compatibility
  // ══════════════════════════════════════════════════════════

  /**
   * Placeholder barcode shown in the "Add Product" form.
   * The server generates the real one if you leave it blank,
   * so two shops never fight over the same code.
   */
  generateBarcode() {
    const next = this.cache.products.length + 1;
    return 'GH-' + String(next).padStart(5, '0');
  },

  /**
   * Receipt numbers now come from the server, which locks the
   * shop's counter so two cashiers can never get the same one.
   */
  generateReceiptNo() {
    return 'PENDING';
  }
};


/**
 * Category names are typed by shop owners, so they can contain
 * anything. Escape before putting them in HTML.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rebuild every category dropdown on the page from this shop's
 * own categories. Called on load and after any category change.
 *
 * Lives here rather than in admin-extra.js because the admin
 * page and the inventory page both need it, and a shop with no
 * categories yet must not see somebody else's.
 */
function refreshCategoryDropdowns() {
  const categories = DB.getAll('categories');

  const options = categories
    .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  // Product forms - a product may have no category at all
  ['prodCategory', 'newProductCategory'].forEach(function (id) {
    const select = document.getElementById(id);
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">&#8212; No category &#8212;</option>' + options;
    if (current) select.value = current;
  });

  // The filter above the product table
  const filterSelect = document.getElementById('categoryFilter');
  if (filterSelect) {
    const current = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">All Categories</option>' + options;
    filterSelect.value = current || 'all';
  }
}
