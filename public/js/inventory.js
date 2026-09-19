/**
 * ============================================================
 * inventory.js - Inventory Management Page Logic
 * ============================================================
 * This file powers the inventory management page. It handles:
 *   - Showing stock overview with stat cards
 *   - Displaying stock levels with search, filter, and status
 *   - Tracking stock movements (in/out history)
 *   - Alerting on low stock and out-of-stock items
 *   - Adjusting stock quantities with audit trail
 *   - Exporting data to CSV files
 *
 * Depends on:
 *   - js/db.js   (localStorage database layer)
 *   - js/auth.js (authentication & session management)
 * ============================================================
 */


// ── GLOBAL STATE ─────────────────────────────────────────────
// We keep a local copy of products so we don't re-read
// localStorage every time we filter or search.

let allProducts = [];
let currentStockFilter = 'all';   // "all", "in-stock", "low-stock", "out-of-stock"
let currentCategoryFilter = 'all';
let currentSearchQuery = '';

// The product ID we're currently adjusting stock for
let adjustingProductId = null;


// ── INITIALIZATION ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {

  // 1. Inventory staff, admins and the owner can open this page
  if (!Auth.requireRole(['inventory', 'admin', 'owner'])) return;

  // 2. Load this shop's branding and stock from the server
  try {
    await Shop.load();
    Shop.apply();
    await DB.init();
  } catch (error) {
    alert(error.message);
    return;
  }

  // 3. Display user info in sidebar
  const user = Auth.getCurrentUser();
  if (user) {
    document.getElementById('sidebarUserName').textContent = user.name;
    document.getElementById('sidebarUserRole').textContent = user.role;
    document.getElementById('headerUserName').textContent = user.name;
  }

  // 4. Load the default tab (Overview)
  loadOverview();

  // 5. Populate the category filter dropdown
  populateCategoryFilter();

  // 6. Update alert badges in sidebar
  updateAlertBadges();
});


// ── TAB SWITCHING ────────────────────────────────────────────

/**
 * Switch between tabs: Overview, Stock Levels, Stock Movements, Alerts.
 * Hides all tabs, shows the selected one, and loads its data.
 *
 * @param {string} tabName - The tab to show (e.g. "overview", "stock-levels")
 */
function switchTab(tabName) {
  // Hide all tab content sections
  document.querySelectorAll('.tab-content').forEach(function (tab) {
    tab.classList.remove('active');
  });

  // Show the selected tab
  const selectedTab = document.getElementById('tab-' + tabName);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // Update sidebar nav link active state
  document.querySelectorAll('.nav-link').forEach(function (link) {
    link.classList.remove('active');
    if (link.dataset.tab === tabName) {
      link.classList.add('active');
    }
  });

  // Load data for the selected tab
  switch (tabName) {
    case 'overview':
      loadOverview();
      break;
    case 'stock-levels':
      loadStockLevels();
      break;
    case 'stock-movements':
      loadStockMovements();
      break;
    case 'alerts':
      loadAlerts();
      break;
  }

  // Close mobile sidebar after selecting a tab
  document.getElementById('sidebar').classList.remove('open');
}

/**
 * Toggle the sidebar on mobile devices.
 */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}


// ── TAB 1: OVERVIEW ──────────────────────────────────────────

/**
 * Load the Overview tab with stat cards, inventory value,
 * category chart, and recent movements.
 */
function loadOverview() {
  // Refresh product data from DB
  allProducts = DB.getAll('products');

  // Count products by stock status
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let totalValue = 0;

  allProducts.forEach(function (product) {
    // Calculate total inventory value (price x stock)
    totalValue += product.price * product.stock;

    // Determine stock status
    if (product.stock <= 0) {
      outOfStock++;
    } else if (product.stock <= product.minStock) {
      lowStock++;
    } else {
      inStock++;
    }
  });

  // Update stat cards
  document.getElementById('totalProducts').textContent = allProducts.length;
  document.getElementById('inStockCount').textContent = inStock;
  document.getElementById('lowStockCount').textContent = lowStock;
  document.getElementById('outOfStockCount').textContent = outOfStock;

  // Update inventory value
  document.getElementById('inventoryValue').textContent = formatCurrency(totalValue);

  // Render category distribution chart
  renderCategoryChart();

  // Render recent stock movements
  renderRecentMovements();

  // Update alert badges
  updateAlertBadges();
}

/**
 * Render a horizontal bar chart showing how many products
 * are in each category. Uses CSS width for the bars.
 */
function renderCategoryChart() {
  const chartContainer = document.getElementById('categoryChart');

  // Count products per category
  const categoryCounts = {};
  allProducts.forEach(function (product) {
    if (!categoryCounts[product.category]) {
      categoryCounts[product.category] = 0;
    }
    categoryCounts[product.category]++;
  });

  // Find the maximum count (for scaling bars to 100%)
  const maxCount = Math.max(...Object.values(categoryCounts), 1);

  // Build the chart HTML
  let html = '';
  Object.keys(categoryCounts).sort().forEach(function (category) {
    const count = categoryCounts[category];
    const percentage = Math.round((count / maxCount) * 100);

    html += `
      <div class="chart-row">
        <span class="chart-label">${category}</span>
        <div class="chart-bar-container">
          <div class="chart-bar" style="width: ${percentage}%;">
            <span>${count}</span>
          </div>
        </div>
      </div>
    `;
  });

  chartContainer.innerHTML = html;
}

/**
 * Render the last 10 stock movements in the overview table.
 */
function renderRecentMovements() {
  const tbody = document.getElementById('recentMovementsBody');
  const movements = DB.getAll('stockMovements');

  // Sort by date (newest first) and take the last 10
  const recent = movements
    .sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    })
    .slice(0, 10);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No stock movements recorded yet.</td></tr>';
    return;
  }

  let html = '';
  recent.forEach(function (mov) {
    const badgeClass = mov.type === 'in' ? 'badge-green' : 'badge-red';
    const typeLabel = mov.type === 'in' ? 'Stock In' : 'Stock Out';

    html += `
      <tr>
        <td>${formatDate(mov.date)}</td>
        <td>${mov.productName}</td>
        <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
        <td>${mov.quantity}</td>
        <td>${mov.performedBy}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}


// ── TAB 2: STOCK LEVELS ──────────────────────────────────────

/**
 * Load and render the stock levels table.
 * Applies any active search, category, or status filters.
 */
function loadStockLevels() {
  allProducts = DB.getAll('products');

  // Apply filters
  let filtered = allProducts;

  // Search filter (by name or barcode)
  if (currentSearchQuery) {
    const query = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(function (p) {
      return p.name.toLowerCase().includes(query) ||
             p.barcode.toLowerCase().includes(query);
    });
  }

  // Category filter
  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter(function (p) {
      return p.category === currentCategoryFilter;
    });
  }

  // Stock status filter
  if (currentStockFilter !== 'all') {
    filtered = filtered.filter(function (p) {
      return getStockStatus(p) === currentStockFilter;
    });
  }

  renderStockTable(filtered);
}

/**
 * Render the stock levels table with the given products.
 *
 * @param {Array} products - Filtered list of products to display
 */
function renderStockTable(products) {
  const tbody = document.getElementById('stockLevelsBody');

  if (products.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No products match your filters.</td></tr>';
    return;
  }

  let html = '';
  products.forEach(function (product) {
    const status = getStockStatus(product);
    const badge = getStatusBadge(status);
    const barWidth = calculateStockPercentage(product.stock, product.minStock);
    const barColor = status === 'in-stock' ? 'green' : (status === 'low-stock' ? 'orange' : 'red');

    html += `
      <tr>
        <td>${product.barcode}</td>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>${formatCurrency(product.price)}</td>
        <td><strong>${product.stock}</strong></td>
        <td>${product.minStock}</td>
        <td>${product.unit}</td>
        <td>${badge}</td>
        <td>
          <div class="stock-bar-container">
            <div class="stock-bar ${barColor}" style="width: ${barWidth}%;"></div>
          </div>
        </td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openAdjustModal('${product.id}')">
            Adjust Stock
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * Filter stock table by search text (product name or barcode).
 *
 * @param {string} query - The search text
 */
function searchStock(query) {
  currentSearchQuery = query;
  loadStockLevels();
}

/**
 * Filter stock table by category.
 *
 * @param {string} category - The selected category or "all"
 */
function filterByCategory(category) {
  currentCategoryFilter = category;
  loadStockLevels();
}

/**
 * Filter stock table by stock status.
 * Updates the active state of filter buttons.
 *
 * @param {string} status - "all", "in-stock", "low-stock", or "out-of-stock"
 */
function filterByStatus(status) {
  currentStockFilter = status;

  // Update which filter button looks active
  document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.classList.remove('active');
    if (btn.dataset.status === status) {
      btn.classList.add('active');
    }
  });

  loadStockLevels();
}

/**
 * Populate the category filter dropdown with unique categories
 * from the products in the database.
 */
function populateCategoryFilter() {
  // Built from the shop's own categories (see db.js) rather than
  // scraped off the products, so a category with nothing in it yet
  // still shows up and uncategorised products don't add a blank.
  refreshCategoryDropdowns();
}


// ── TAB 3: STOCK MOVEMENTS ──────────────────────────────────

/**
 * Load and render the stock movements table.
 */
function loadStockMovements() {
  applyMovementFilters();
}

/**
 * Apply date and type filters to the movements table.
 * Called when any filter changes.
 */
function applyMovementFilters() {
  let movements = DB.getAll('stockMovements');

  // Get filter values
  const dateFrom = document.getElementById('moveDateFrom').value;
  const dateTo = document.getElementById('moveDateTo').value;
  const typeFilter = document.getElementById('moveTypeFilter').value;

  // Filter by date range
  if (dateFrom) {
    movements = movements.filter(function (m) {
      return new Date(m.date) >= new Date(dateFrom);
    });
  }
  if (dateTo) {
    // Add one day to include the entire "to" date
    const toDate = new Date(dateTo);
    toDate.setDate(toDate.getDate() + 1);
    movements = movements.filter(function (m) {
      return new Date(m.date) < toDate;
    });
  }

  // Filter by type (in/out)
  if (typeFilter !== 'all') {
    movements = movements.filter(function (m) {
      return m.type === typeFilter;
    });
  }

  // Sort by date (newest first)
  movements.sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  renderMovementsTable(movements);
}

/**
 * Render the stock movements table.
 *
 * @param {Array} movements - Filtered list of stock movements
 */
function renderMovementsTable(movements) {
  const tbody = document.getElementById('movementsBody');

  if (movements.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No stock movements found.</td></tr>';
    return;
  }

  let html = '';
  movements.forEach(function (mov) {
    const badgeClass = mov.type === 'in' ? 'badge-green' : 'badge-red';
    const typeLabel = mov.type === 'in' ? 'Stock In' : 'Stock Out';

    html += `
      <tr>
        <td>${formatDate(mov.date)}</td>
        <td>${mov.productName}</td>
        <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
        <td>${mov.quantity}</td>
        <td>${mov.previousStock}</td>
        <td>${mov.newStock}</td>
        <td>${mov.reason}</td>
        <td>${mov.performedBy}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}


// ── TAB 4: ALERTS ────────────────────────────────────────────

/**
 * Load and render the alerts tab.
 * Shows low stock and out of stock products as alert cards.
 */
function loadAlerts() {
  allProducts = DB.getAll('products');

  // Separate low stock and out of stock products
  const lowStockProducts = allProducts.filter(function (p) {
    return p.stock > 0 && p.stock <= p.minStock;
  });

  const outOfStockProducts = allProducts.filter(function (p) {
    return p.stock <= 0;
  });

  // Update badges
  document.getElementById('lowStockBadge').textContent = lowStockProducts.length;
  document.getElementById('outOfStockBadge').textContent = outOfStockProducts.length;

  // Render low stock alerts
  renderAlertCards('lowStockAlerts', lowStockProducts, 'low-stock');

  // Render out of stock alerts
  renderAlertCards('outOfStockAlerts', outOfStockProducts, 'out-of-stock');
}

/**
 * Render alert cards for a group of products.
 *
 * @param {string} containerId - The ID of the container element
 * @param {Array} products     - Products to display as alerts
 * @param {string} alertType   - "low-stock" or "out-of-stock"
 */
function renderAlertCards(containerId, products, alertType) {
  const container = document.getElementById(containerId);

  if (products.length === 0) {
    container.innerHTML = '<div class="no-alerts">No alerts. All products are well-stocked!</div>';
    return;
  }

  let html = '';
  products.forEach(function (product) {
    html += `
      <div class="alert-card ${alertType}">
        <div class="alert-card-title">${product.name}</div>
        <div class="alert-card-info">
          Current Stock: <strong>${product.stock} ${product.unit}</strong>
          &nbsp;|&nbsp;
          Min Required: <strong>${product.minStock} ${product.unit}</strong>
        </div>
        <div class="alert-card-info">
          Barcode: ${product.barcode} &nbsp;|&nbsp; Category: ${product.category}
        </div>
        <div class="alert-card-actions">
          <button class="btn btn-primary btn-sm" onclick="openAdjustModal('${product.id}', 'in')">
            Restock Now
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}


// ── ADD PRODUCT MODAL ────────────────────────────────────────

/**
 * Open the Add Product modal and clear all fields.
 */
function openAddProductModal() {
  document.getElementById('newProductName').value = '';
  document.getElementById('newProductCategory').value = '';
  document.getElementById('newProductPrice').value = '';
  document.getElementById('newProductUnit').value = '';
  document.getElementById('newProductStock').value = '';
  document.getElementById('newProductMinStock').value = '';
  document.getElementById('newProductBarcode').value = '';
  document.getElementById('addProductError').style.display = 'none';
  document.getElementById('addProductModal').classList.add('show');
}

/**
 * Close the Add Product modal.
 */
function closeAddProductModal() {
  document.getElementById('addProductModal').classList.remove('show');
}

/**
 * Auto-fill the barcode field with a newly generated barcode.
 */
function autoGenerateBarcode() {
  document.getElementById('newProductBarcode').value = DB.generateBarcode();
}

/**
 * Validate and save a new product from the Add Product form.
 */
async function handleAddProductSubmit() {
  const name     = document.getElementById('newProductName').value.trim();
  const category = document.getElementById('newProductCategory').value;
  const price    = parseFloat(document.getElementById('newProductPrice').value);
  const unit     = document.getElementById('newProductUnit').value.trim();
  const stock    = parseInt(document.getElementById('newProductStock').value);
  const minStock = parseInt(document.getElementById('newProductMinStock').value);
  let   barcode  = document.getElementById('newProductBarcode').value.trim();

  const errorEl = document.getElementById('addProductError');
  errorEl.style.display = 'none';

  // --- Validation ---
  if (!name) {
    errorEl.textContent = 'Product name is required.';
    errorEl.style.display = 'block';
    return;
  }
  if (isNaN(price) || price < 0) {
    errorEl.textContent = 'Please enter a valid price.';
    errorEl.style.display = 'block';
    return;
  }
  if (!unit) {
    errorEl.textContent = 'Unit is required (e.g. pcs, kg).';
    errorEl.style.display = 'block';
    return;
  }
  if (isNaN(stock) || stock < 0) {
    errorEl.textContent = 'Please enter a valid initial stock amount.';
    errorEl.style.display = 'block';
    return;
  }
  if (isNaN(minStock) || minStock < 0) {
    errorEl.textContent = 'Please enter a valid minimum stock level.';
    errorEl.style.display = 'block';
    return;
  }

  // Auto-generate barcode if not provided
  if (!barcode) {
    barcode = DB.generateBarcode();
  } else {
    // Check barcode is not already in use
    const existing = DB.getAll('products').find(function (p) {
      return p.barcode.toLowerCase() === barcode.toLowerCase();
    });
    if (existing) {
      errorEl.textContent = 'Barcode "' + barcode + '" is already assigned to another product.';
      errorEl.style.display = 'block';
      return;
    }
  }

  // --- Save ---
  const user = Auth.getCurrentUser();
  const newProduct = {
    name: name,
    category: category,
    price: price,
    unit: unit,
    stock: stock,
    minStock: minStock,
    barcode: barcode
  };

  // The server saves the product AND records the opening stock as a
  // stock movement, so we no longer write that movement by hand.
  try {
    await DB.add('products', newProduct);
    await DB.refresh('stockMovements');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  closeAddProductModal();
  showNotification('Product "' + name + '" added successfully!', 'success');

  // Refresh the category filter dropdown with any new categories
  const select = document.getElementById('categoryFilter');
  if (select && !Array.from(select.options).some(function (o) { return o.value === category; })) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  // Refresh whichever tab is active
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    const tabId = activeTab.id.replace('tab-', '');
    switchTab(tabId);
  }

  updateAlertBadges();
}


// ── STOCK ADJUSTMENT MODAL ───────────────────────────────────

/**
 * Open the stock adjustment modal for a specific product.
 * Optionally pre-select the adjustment type.
 *
 * @param {string} productId   - The ID of the product to adjust
 * @param {string} [presetType] - Optional: "in" or "out" to pre-select
 */
function openAdjustModal(productId, presetType) {
  const product = DB.getById('products', productId);
  if (!product) {
    showNotification('Product not found.', 'error');
    return;
  }

  // Store the product ID for when we submit
  adjustingProductId = productId;

  // Fill in the read-only fields
  document.getElementById('modalProductName').value = product.name;
  document.getElementById('modalCurrentStock').value = product.stock + ' ' + product.unit;

  // Pre-select adjustment type if provided
  if (presetType) {
    document.getElementById('adjustType').value = presetType;
  } else {
    document.getElementById('adjustType').value = 'in';
  }

  // Clear the input fields
  document.getElementById('adjustQuantity').value = '';
  document.getElementById('adjustReason').value = '';

  // Hide any previous error message
  document.getElementById('modalError').style.display = 'none';

  // Show the modal
  document.getElementById('adjustModal').classList.add('show');
}

/**
 * Close the stock adjustment modal.
 */
function closeAdjustModal() {
  document.getElementById('adjustModal').classList.remove('show');
  adjustingProductId = null;
}

/**
 * Handle the submit of the stock adjustment form.
 * Validates inputs, updates the product stock, and creates
 * a stock movement record for the audit trail.
 */
async function handleAdjustSubmit() {
  // Get form values
  const type = document.getElementById('adjustType').value;
  const quantity = parseInt(document.getElementById('adjustQuantity').value);
  const reason = document.getElementById('adjustReason').value.trim();
  const errorEl = document.getElementById('modalError');

  // -- Validation --

  // Check quantity is a valid positive number
  if (!quantity || quantity <= 0) {
    errorEl.textContent = 'Please enter a valid quantity greater than 0.';
    errorEl.style.display = 'block';
    return;
  }

  // Check reason is provided
  if (!reason) {
    errorEl.textContent = 'Please enter a reason for this adjustment.';
    errorEl.style.display = 'block';
    return;
  }

  // Get the product from the database
  const product = DB.getById('products', adjustingProductId);
  if (!product) {
    errorEl.textContent = 'Product not found.';
    errorEl.style.display = 'block';
    return;
  }

  // If removing stock, make sure we have enough
  if (type === 'out' && quantity > product.stock) {
    errorEl.textContent = 'Cannot remove ' + quantity + '. Only ' + product.stock + ' in stock.';
    errorEl.style.display = 'block';
    return;
  }

  // -- Apply the adjustment --

  const previousStock = product.stock;
  const newStock = type === 'in'
    ? previousStock + quantity
    : previousStock - quantity;

  // One call: the server changes the stock and writes the audit
  // record together, so they can never fall out of step.
  try {
    await API.products.adjustStock(adjustingProductId, {
      type: type,
      quantity: quantity,
      reason: reason
    });
    await DB.refresh('products');
    await DB.refresh('stockMovements');
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  // Close the modal
  closeAdjustModal();

  // Show success notification
  const action = type === 'in' ? 'added to' : 'removed from';
  showNotification(quantity + ' ' + product.unit + ' ' + action + ' ' + product.name, 'success');

  // Refresh whatever tab is currently active
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    const tabId = activeTab.id.replace('tab-', '');
    switchTab(tabId);
  }

  // Update alert badges
  updateAlertBadges();
}


// ── EXPORT TO CSV ────────────────────────────────────────────

/**
 * Export the current stock levels to a CSV file.
 * Creates a downloadable file that opens in Excel/Google Sheets.
 */
function exportStockLevelsCSV() {
  const products = DB.getAll('products');

  // CSV header row
  const headers = ['Barcode', 'Product Name', 'Category', 'Price (GH₵)', 'Stock', 'Min Stock', 'Unit', 'Status'];

  // CSV data rows
  const rows = products.map(function (p) {
    const status = getStockStatus(p);
    return [
      p.barcode,
      '"' + p.name + '"',   // Wrap in quotes in case name has commas
      p.category,
      p.price.toFixed(2),
      p.stock,
      p.minStock,
      p.unit,
      status
    ];
  });

  downloadCSV(headers, rows, 'stock-levels.csv');
  showNotification('Stock levels exported to CSV.', 'success');
}

/**
 * Export the stock movements to a CSV file.
 */
function exportMovementsCSV() {
  const movements = DB.getAll('stockMovements');

  // Sort by date (newest first)
  movements.sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  const headers = ['Date', 'Product', 'Type', 'Quantity', 'Previous Stock', 'New Stock', 'Reason', 'Performed By'];

  const rows = movements.map(function (m) {
    return [
      formatDate(m.date),
      '"' + m.productName + '"',
      m.type === 'in' ? 'Stock In' : 'Stock Out',
      m.quantity,
      m.previousStock,
      m.newStock,
      '"' + m.reason + '"',
      m.performedBy
    ];
  });

  downloadCSV(headers, rows, 'stock-movements.csv');
  showNotification('Stock movements exported to CSV.', 'success');
}

/**
 * Helper function to create and download a CSV file.
 *
 * @param {Array} headers - Array of header strings
 * @param {Array} rows    - Array of arrays (each inner array is a row)
 * @param {string} filename - The filename for the download
 */
function downloadCSV(headers, rows, filename) {
  // Combine headers and rows into CSV text
  let csvContent = headers.join(',') + '\n';
  rows.forEach(function (row) {
    csvContent += row.join(',') + '\n';
  });

  // Create a download link and click it
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// ── ALERT BADGES ─────────────────────────────────────────────

/**
 * Update the alert badge in the sidebar navigation.
 * Shows the count of low stock + out of stock items.
 */
function updateAlertBadges() {
  const products = DB.getAll('products');

  // Count products that need attention
  const alertCount = products.filter(function (p) {
    return p.stock <= p.minStock;
  }).length;

  // Update the badge
  const badge = document.getElementById('alertBadge');
  if (alertCount > 0) {
    badge.textContent = alertCount;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}


// ── UTILITY / HELPER FUNCTIONS ───────────────────────────────

/**
 * Determine the stock status of a product.
 *
 * @param {Object} product - A product object
 * @returns {string} "in-stock", "low-stock", or "out-of-stock"
 */
function getStockStatus(product) {
  if (product.stock <= 0) {
    return 'out-of-stock';
  } else if (product.stock <= product.minStock) {
    return 'low-stock';
  }
  return 'in-stock';
}

/**
 * Get the HTML for a status badge based on stock status.
 *
 * @param {string} status - "in-stock", "low-stock", or "out-of-stock"
 * @returns {string} Badge HTML string
 */
function getStatusBadge(status) {
  switch (status) {
    case 'in-stock':
      return '<span class="badge badge-green">In Stock</span>';
    case 'low-stock':
      return '<span class="badge badge-orange">Low Stock</span>';
    case 'out-of-stock':
      return '<span class="badge badge-red">Out of Stock</span>';
    default:
      return '';
  }
}

/**
 * Calculate the stock level as a percentage for the progress bar.
 * The bar is "full" when stock is at 2x the minStock threshold.
 *
 * @param {number} stock    - Current stock quantity
 * @param {number} minStock - Minimum stock threshold
 * @returns {number} Percentage (0-100)
 */
function calculateStockPercentage(stock, minStock) {
  if (minStock <= 0) {
    return stock > 0 ? 100 : 0;
  }

  // Consider "full" to be 2x the minimum stock
  const fullLevel = minStock * 2;
  const percentage = Math.round((stock / fullLevel) * 100);

  // Clamp between 0 and 100
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Format a number as Ghana Cedis currency.
 * Example: 85.5 -> "GH₵ 85.50"
 *
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return 'GH\u20B5 ' + amount.toFixed(2);
}

/**
 * Format a date string or Date object into a readable format.
 * Example: "2026-04-13T09:15:00" -> "13 Apr 2026"
 *
 * @param {string|Date} dateStr - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options);
}

/**
 * Show a notification toast at the top of the page.
 * Automatically disappears after 3 seconds.
 *
 * @param {string} message - The message to display
 * @param {string} type    - "success", "error", or "info"
 */
function showNotification(message, type) {
  const notification = document.getElementById('notification');
  const messageEl = document.getElementById('notificationMessage');

  // Set the message and style
  messageEl.textContent = message;
  notification.className = 'notification ' + (type || 'info');
  notification.style.display = 'block';

  // Auto-hide after 3 seconds
  setTimeout(function () {
    notification.style.display = 'none';
  }, 3000);
}
