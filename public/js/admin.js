/**
 * ============================================================
 * admin.js - QuickMart Ghana Admin Dashboard Logic
 * ============================================================
 * This file powers the entire admin dashboard. It handles:
 *   - Dashboard stats, charts, and recent sales
 *   - Product management (CRUD - Create, Read, Update, Delete)
 *   - Sales history viewing, filtering, and CSV export
 *   - User management (CRUD)
 *
 * Depends on:
 *   - js/db.js   (localStorage database layer)
 *   - js/auth.js (authentication & session management)
 *
 * Currency: Ghana Cedi (GH₵)
 * ============================================================
 */


// ============================================================
// INITIALIZATION
// ============================================================

/**
 * When the page finishes loading, we:
 * 1. Initialize the database (seeds sample data if empty)
 * 2. Check that the logged-in user is an admin
 * 3. Display the admin's name in the sidebar and header
 * 4. Load the dashboard with stats and charts
 */
document.addEventListener('DOMContentLoaded', async function () {
  // Step 1: Only owners and admins can open this page
  if (!Auth.requireRole(['owner', 'admin'])) return;

  // Step 2: Load this shop's branding, then this shop's data.
  //         Both come from the server now, so we wait for them.
  try {
    await Shop.load();
    Shop.apply();
    await DB.init();
  } catch (error) {
    showNotification(error.message, 'error');
    return;
  }

  // Step 3: Get the logged-in user's info and display it
  const user = Auth.getCurrentUser();
  if (user) {
    // Show first letter of name as avatar (e.g. "K" for Kwame)
    document.getElementById('userAvatar').textContent = user.name.charAt(0);
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userRole').textContent = user.role;
    document.getElementById('welcomeName').textContent = user.name;
  }

  // Step 4: Load the dashboard view
  loadDashboard();

  // Step 5: Wire up the two new tabs (Categories, Shop Settings)
  if (typeof initExtras === 'function') initExtras();
});


// ============================================================
// TAB SWITCHING
// ============================================================

/**
 * Switch between dashboard tabs (Dashboard, Products, Sales, Users).
 * This function:
 *   1. Hides all tab sections
 *   2. Shows the selected one
 *   3. Updates the active state in the sidebar navigation
 *   4. Updates the page title in the header
 *   5. Loads the relevant data for that tab
 *
 * @param {string} tabName - The tab to switch to: 'dashboard', 'products', 'sales', or 'users'
 */
function switchTab(tabName) {
  // --- Hide all tab sections ---
  const allSections = document.querySelectorAll('.tab-section');
  allSections.forEach(function (section) {
    section.classList.remove('active');
  });

  // --- Show the selected tab section ---
  const targetSection = document.getElementById('tab-' + tabName);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // --- Update sidebar nav links (highlight active one) ---
  const allNavLinks = document.querySelectorAll('.nav-link');
  allNavLinks.forEach(function (link) {
    link.classList.remove('active');
  });
  // Find the nav link with the matching data-tab attribute
  const activeLink = document.querySelector('.nav-link[data-tab="' + tabName + '"]');
  if (activeLink) {
    activeLink.classList.add('active');
  }

  // --- Update the page title in the top header ---
  const titles = {
    dashboard: 'Dashboard',
    products: 'Products',
    sales: 'Sales History',
    users: 'User Management',
    'staff-activity': 'Staff Activity',
    categories: 'Categories',
    settings: 'Shop Settings'
  };
  document.getElementById('pageTitle').textContent = titles[tabName] || 'Dashboard';

  // --- Load data for the selected tab ---
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'products') loadProducts();
  if (tabName === 'sales') loadSales();
  if (tabName === 'users') loadUsers();
  if (tabName === 'staff-activity') loadStaffActivity();
  if (tabName === 'categories') loadCategories();
  if (tabName === 'settings') loadSettings();

  // --- Close sidebar on mobile after switching ---
  document.getElementById('sidebar').classList.remove('open');
}

/**
 * Toggle the sidebar open/closed on mobile devices.
 * Adds or removes the "open" class which controls visibility via CSS.
 */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}


// ============================================================
// UTILITY / HELPER FUNCTIONS
// ============================================================

/**
 * Format a number as Ghana Cedi currency.
 * Example: formatCurrency(135.5) => "GH₵ 135.50"
 *
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return 'GH\u20B5 ' + Number(amount).toFixed(2);
}

/**
 * Format a date string into a readable format.
 * Example: formatDate('2026-04-13T09:15:00') => "13 Apr 2026, 09:15"
 *
 * @param {string} dateStr - An ISO date string
 * @returns {string} A human-readable date string
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return date.toLocaleDateString('en-GB', options);
}

/**
 * Get a coloured badge for a payment method.
 * - cash  => green badge
 * - momo  => yellow/warning badge
 * - card  => blue/info badge
 *
 * @param {string} method - The payment method ('cash', 'momo', or 'card')
 * @returns {string} HTML string for the badge
 */
function getPaymentBadge(method) {
  const badges = {
    cash: '<span class="badge badge-success">Cash</span>',
    momo: '<span class="badge badge-warning">MoMo</span>',
    card: '<span class="badge badge-info">Card</span>'
  };
  // If the method is unknown, default to a plain badge
  return badges[method] || '<span class="badge">' + method + '</span>';
}

/**
 * Get a stock status badge for a product.
 * Compares current stock to the minimum stock level.
 * - Out of stock (0)          => red badge
 * - Low stock (below minimum) => yellow badge
 * - In stock (at or above)    => green badge
 *
 * @param {Object} product - A product object with stock and minStock fields
 * @returns {string} HTML string for the stock status badge
 */
function getStockStatus(product) {
  if (product.stock <= 0) {
    return '<span class="badge badge-danger">Out of Stock</span>';
  }
  if (product.stock < product.minStock) {
    return '<span class="badge badge-warning">Low Stock</span>';
  }
  return '<span class="badge badge-success">In Stock</span>';
}

/**
 * Show a toast notification that slides in and auto-hides after 3 seconds.
 *
 * @param {string} message - The message to display
 * @param {string} type    - The type: 'success', 'error', 'warning', or 'info'
 */
function showNotification(message, type) {
  const toast = document.getElementById('toast');

  // Set the message and style
  toast.textContent = message;
  toast.className = 'notification-toast ' + type;

  // Trigger the slide-in animation by adding "show"
  // We use a tiny delay so the browser registers the class change
  setTimeout(function () {
    toast.classList.add('show');
  }, 10);

  // Auto-hide after 3 seconds
  setTimeout(function () {
    toast.classList.remove('show');
  }, 3000);
}


// ============================================================
// DASHBOARD
// ============================================================

/**
 * Load all dashboard data: stat cards, sales chart, top products,
 * and the recent sales table. This is called when the page loads
 * and whenever the user switches to the Dashboard tab.
 */
function loadDashboard() {
  // Fetch all data we need
  const products = DB.getAll('products');
  const sales = DB.getAll('sales');

  // --- Stat Card 1: Total Products ---
  document.getElementById('statProducts').textContent = products.length;

  // --- Stat Card 2: Total Sales (count) ---
  // We show the total monetary value of all sales
  const totalSalesValue = sales.reduce(function (sum, sale) {
    return sum + sale.total;
  }, 0);
  document.getElementById('statSales').textContent = formatCurrency(totalSalesValue);

  // --- Stat Card 3: Low Stock Items ---
  // Count products where current stock is below the minimum
  const lowStockCount = products.filter(function (product) {
    return product.stock < product.minStock;
  }).length;
  document.getElementById('statLowStock').textContent = lowStockCount;

  // --- Stat Card 4: Total Revenue (same as total sales here) ---
  document.getElementById('statRevenue').textContent = formatCurrency(totalSalesValue);

  // --- Render the sales bar chart ---
  renderSalesChart(sales);

  // --- Render the top selling products list ---
  renderTopProducts(sales);

  // --- Render the recent sales table ---
  renderRecentSales(sales);
}

/**
 * Create a bar chart showing daily sales totals for the last 7 days.
 * Each bar is a div element whose height is proportional to the day's total.
 * Uses the CSS classes: .bar-chart, .bar-column, .bar, .bar-label, .bar-value
 *
 * @param {Array} sales - Array of all sale records
 */
function renderSalesChart(sales) {
  const chartContainer = document.getElementById('salesChart');

  // Build an array of the last 7 days (today + 6 previous days)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date);
  }

  // Calculate the total sales amount for each day
  const dailyTotals = days.map(function (day) {
    // Format this day as YYYY-MM-DD for comparison
    const dayStr = day.toISOString().slice(0, 10);

    // Sum up all sales that happened on this day
    const dayTotal = sales
      .filter(function (sale) {
        const saleDate = new Date(sale.date).toISOString().slice(0, 10);
        return saleDate === dayStr;
      })
      .reduce(function (sum, sale) {
        return sum + sale.total;
      }, 0);

    return {
      label: day.toLocaleDateString('en-GB', { weekday: 'short' }), // "Mon", "Tue", etc.
      total: dayTotal
    };
  });

  // Find the highest daily total (used to scale bar heights)
  const maxTotal = Math.max(...dailyTotals.map(function (d) { return d.total; }), 1);

  // Build the HTML for each bar column
  let chartHTML = '';
  dailyTotals.forEach(function (day) {
    // Calculate bar height as a percentage of the max (minimum 2% so it's visible)
    const heightPercent = day.total > 0 ? (day.total / maxTotal) * 100 : 2;

    chartHTML += ''
      + '<div class="bar-column">'
      +   '<div class="bar-value">' + formatCurrency(day.total) + '</div>'
      +   '<div class="bar" style="height: ' + heightPercent + '%;"></div>'
      +   '<div class="bar-label">' + day.label + '</div>'
      + '</div>';
  });

  chartContainer.innerHTML = chartHTML;
}

/**
 * Analyze all sales to find the top 5 most-sold products.
 * Counts total quantity sold per product across all sales,
 * then renders them in a ranked list using the .top-list class.
 *
 * @param {Array} sales - Array of all sale records
 */
function renderTopProducts(sales) {
  const topList = document.getElementById('topProducts');

  // Build a map of product name => total quantity sold
  // We loop through every sale and every item in that sale
  const productCounts = {};
  sales.forEach(function (sale) {
    sale.items.forEach(function (item) {
      // If this product hasn't been seen yet, start at 0
      if (!productCounts[item.name]) {
        productCounts[item.name] = 0;
      }
      // Add this item's quantity to the running total
      productCounts[item.name] += item.quantity;
    });
  });

  // Convert the map to an array of {name, quantity} objects
  const sortedProducts = Object.keys(productCounts).map(function (name) {
    return { name: name, quantity: productCounts[name] };
  });

  // Sort by quantity descending (highest first)
  sortedProducts.sort(function (a, b) {
    return b.quantity - a.quantity;
  });

  // Take only the top 5
  const top5 = sortedProducts.slice(0, 5);

  // Build the list HTML
  if (top5.length === 0) {
    topList.innerHTML = '<li class="empty-state">No sales data yet</li>';
    return;
  }

  let listHTML = '';
  top5.forEach(function (product, index) {
    listHTML += ''
      + '<li>'
      +   '<span class="rank">#' + (index + 1) + '</span>'
      +   '<span class="item-name">' + product.name + '</span>'
      +   '<span class="item-qty">' + product.quantity + ' sold</span>'
      + '</li>';
  });

  topList.innerHTML = listHTML;
}

/**
 * Render the last 10 sales in the "Recent Sales" table on the dashboard.
 * Each row is clickable to view sale details.
 *
 * @param {Array} sales - Array of all sale records
 */
function renderRecentSales(sales) {
  const tbody = document.getElementById('recentSalesBody');

  // Sort sales by date descending (newest first)
  const sorted = sales.slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  // Take only the most recent 10
  const recent = sorted.slice(0, 10);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No sales recorded yet</td></tr>';
    return;
  }

  let html = '';
  recent.forEach(function (sale) {
    html += ''
      + '<tr class="clickable" onclick="viewSaleDetails(\'' + sale.id + '\')">'
      +   '<td>' + sale.receiptNo + '</td>'
      +   '<td>' + formatDate(sale.date) + '</td>'
      +   '<td>' + sale.items.length + ' item(s)</td>'
      +   '<td>' + formatCurrency(sale.total) + '</td>'
      +   '<td>' + getPaymentBadge(sale.paymentMethod) + '</td>'
      +   '<td>' + sale.cashierName + '</td>'
      + '</tr>';
  });

  tbody.innerHTML = html;
}


// ============================================================
// PRODUCTS MANAGEMENT
// ============================================================

/**
 * Load and display all products in the Products table.
 * Applies any active search text and category filter.
 */
function loadProducts() {
  // Get the current search text and category filter values
  const searchText = document.getElementById('productSearch').value.toLowerCase();
  const categoryFilter = document.getElementById('categoryFilter').value;

  // Fetch all products from the database
  let products = DB.getAll('products');

  // Apply search filter (matches product name or barcode)
  if (searchText) {
    products = products.filter(function (product) {
      return product.name.toLowerCase().includes(searchText)
        || product.barcode.toLowerCase().includes(searchText);
    });
  }

  // Apply category filter
  if (categoryFilter !== 'all') {
    products = products.filter(function (product) {
      return product.category === categoryFilter;
    });
  }

  // Build the table rows
  const tbody = document.getElementById('productsBody');

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No products found</td></tr>';
    return;
  }

  let html = '';
  products.forEach(function (product) {
    html += ''
      + '<tr>'
      +   '<td>' + product.barcode + '</td>'
      +   '<td>' + product.name + '</td>'
      +   '<td>' + product.category + '</td>'
      +   '<td>' + formatCurrency(product.price) + '</td>'
      +   '<td>' + product.stock + ' ' + product.unit + '</td>'
      +   '<td>' + getStockStatus(product) + '</td>'
      +   '<td>'
      +     '<div class="action-btns">'
      +       '<button class="btn btn-sm btn-edit" onclick="openProductModal(\'' + product.id + '\')">Edit</button>'
      +       '<button class="btn btn-sm btn-delete" onclick="deleteProduct(\'' + product.id + '\')">Delete</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  });

  tbody.innerHTML = html;
}

/**
 * Called when the user types in the product search box.
 * Simply reloads the products table (which applies the search filter).
 */
function searchProducts() {
  loadProducts();
}

/**
 * Called when the user selects a category from the filter dropdown.
 * Simply reloads the products table (which applies the category filter).
 */
function filterProducts() {
  loadProducts();
}

/**
 * Open the product modal for adding a new product or editing an existing one.
 * If a productId is provided, it pre-fills the form with that product's data.
 *
 * @param {string} [productId] - Optional. The ID of the product to edit.
 */
function openProductModal(productId) {
  // Reset all form fields first
  document.getElementById('editProductId').value = '';
  document.getElementById('prodName').value = '';
  document.getElementById('prodCategory').value = '';   // no category until one is picked
  document.getElementById('prodPrice').value = '';
  document.getElementById('prodBarcode').value = '';
  document.getElementById('prodStock').value = '';
  document.getElementById('prodMinStock').value = '';
  document.getElementById('prodUnit').value = 'pcs';

  if (productId) {
    // --- EDIT MODE: Load existing product data ---
    const product = DB.getById('products', productId);
    if (product) {
      document.getElementById('productModalTitle').textContent = 'Edit Product';
      document.getElementById('editProductId').value = product.id;
      document.getElementById('prodName').value = product.name;
      document.getElementById('prodCategory').value = product.category;
      document.getElementById('prodPrice').value = product.price;
      document.getElementById('prodBarcode').value = product.barcode;
      document.getElementById('prodStock').value = product.stock;
      document.getElementById('prodMinStock').value = product.minStock;
      document.getElementById('prodUnit').value = product.unit;
    }
  } else {
    // --- ADD MODE: Generate a new barcode automatically ---
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('prodBarcode').value = DB.generateBarcode();
  }

  // Show the modal
  document.getElementById('productModal').classList.add('show');
}

/**
 * Close the product modal and reset the form.
 */
function closeProductModal() {
  document.getElementById('productModal').classList.remove('show');
}

/**
 * Validate and save a product (either new or updated).
 * Reads values from the modal form, validates them,
 * then calls DB.add() or DB.update() accordingly.
 */
async function saveProduct() {
  // Read all form values
  const id = document.getElementById('editProductId').value;
  const name = document.getElementById('prodName').value.trim();
  const category = document.getElementById('prodCategory').value;
  const price = parseFloat(document.getElementById('prodPrice').value);
  const barcode = document.getElementById('prodBarcode').value;
  const stock = parseInt(document.getElementById('prodStock').value);
  const minStock = parseInt(document.getElementById('prodMinStock').value);
  const unit = document.getElementById('prodUnit').value;

  // --- Validation ---
  if (!name) {
    showNotification('Please enter a product name', 'error');
    return;
  }
  if (isNaN(price) || price < 0) {
    showNotification('Please enter a valid price', 'error');
    return;
  }
  if (isNaN(stock) || stock < 0) {
    showNotification('Please enter a valid stock quantity', 'error');
    return;
  }
  if (isNaN(minStock) || minStock < 0) {
    showNotification('Please enter a valid minimum stock level', 'error');
    return;
  }

  // Build the product data object
  const productData = {
    name: name,
    category: category,
    price: price,
    barcode: barcode,
    stock: stock,
    minStock: minStock,
    unit: unit
  };

  if (id) {
    // --- UPDATE existing product ---
    await DB.update('products', id, productData);
    showNotification('Product updated successfully', 'success');
  } else {
    // --- ADD new product ---
    await DB.add('products', productData);
    showNotification('Product added successfully', 'success');
  }

  // Close the modal and refresh the products table
  closeProductModal();
  loadProducts();
}

/**
 * Delete a product after user confirmation.
 * Shows a confirm dialog to prevent accidental deletions.
 *
 * @param {string} id - The ID of the product to delete
 */
async function deleteProduct(id) {
  // Look up the product name for a meaningful confirmation message
  const product = DB.getById('products', id);
  if (!product) return;

  const confirmed = confirm('Are you sure you want to delete "' + product.name + '"?');
  if (confirmed) {
    await DB.delete('products', id);
    showNotification('Product deleted successfully', 'success');
    loadProducts();
  }
}


// ============================================================
// SALES
// ============================================================

/**
 * Load and display the sales history.
 * Also renders summary cards showing totals by payment method.
 */
function loadSales() {
  // Fetch all sales and apply any active filters
  const filteredSales = getFilteredSales();

  // --- Render Summary Cards ---
  renderSalesSummary(filteredSales);

  // --- Render Sales Table ---
  const tbody = document.getElementById('salesBody');

  if (filteredSales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No sales found</td></tr>';
    return;
  }

  // Sort by date descending (newest first)
  const sorted = filteredSales.slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  let html = '';
  sorted.forEach(function (sale) {
    html += ''
      + '<tr class="clickable" onclick="viewSaleDetails(\'' + sale.id + '\')">'
      +   '<td>' + sale.receiptNo + '</td>'
      +   '<td>' + formatDate(sale.date) + '</td>'
      +   '<td>' + sale.items.length + ' item(s)</td>'
      +   '<td>' + formatCurrency(sale.total) + '</td>'
      +   '<td>' + getPaymentBadge(sale.paymentMethod) + '</td>'
      +   '<td>' + sale.cashierName + '</td>'
      + '</tr>';
  });

  tbody.innerHTML = html;
}

/**
 * Get sales filtered by the current date range and payment method.
 * Reads values from the filter controls in the toolbar.
 *
 * @returns {Array} Filtered array of sale records
 */
function getFilteredSales() {
  let sales = DB.getAll('sales');

  // Get filter values from the toolbar
  const dateFrom = document.getElementById('salesDateFrom').value;
  const dateTo = document.getElementById('salesDateTo').value;
  const paymentFilter = document.getElementById('paymentFilter').value;

  // Filter by start date (if set)
  if (dateFrom) {
    sales = sales.filter(function (sale) {
      return new Date(sale.date) >= new Date(dateFrom);
    });
  }

  // Filter by end date (if set)
  // We add a full day so "to" date is inclusive
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    sales = sales.filter(function (sale) {
      return new Date(sale.date) <= endOfDay;
    });
  }

  // Filter by payment method (if not "all")
  if (paymentFilter !== 'all') {
    sales = sales.filter(function (sale) {
      return sale.paymentMethod === paymentFilter;
    });
  }

  return sales;
}

/**
 * Render the summary cards above the sales table.
 * Shows: Total Sales, Cash Total, MoMo Total, Card Total.
 *
 * @param {Array} sales - The filtered sales array
 */
function renderSalesSummary(sales) {
  // Calculate totals for each payment method
  const totalAll = sales.reduce(function (sum, s) { return sum + s.total; }, 0);
  const totalCash = sales.filter(function (s) { return s.paymentMethod === 'cash'; })
    .reduce(function (sum, s) { return sum + s.total; }, 0);
  const totalMomo = sales.filter(function (s) { return s.paymentMethod === 'momo'; })
    .reduce(function (sum, s) { return sum + s.total; }, 0);
  const totalCard = sales.filter(function (s) { return s.paymentMethod === 'card'; })
    .reduce(function (sum, s) { return sum + s.total; }, 0);

  const summaryContainer = document.getElementById('salesSummary');
  summaryContainer.innerHTML = ''
    + '<div class="summary-card"><h4>Total Sales</h4><div class="summary-value">' + formatCurrency(totalAll) + '</div></div>'
    + '<div class="summary-card"><h4>Cash</h4><div class="summary-value">' + formatCurrency(totalCash) + '</div></div>'
    + '<div class="summary-card"><h4>Mobile Money</h4><div class="summary-value">' + formatCurrency(totalMomo) + '</div></div>'
    + '<div class="summary-card"><h4>Card</h4><div class="summary-value">' + formatCurrency(totalCard) + '</div></div>';
}

/**
 * Called when any sales filter changes (date inputs or payment dropdown).
 * Reloads the sales table and summary with the new filters applied.
 */
function filterSales() {
  loadSales();
}

/**
 * Open a modal showing the full details of a specific sale.
 * Displays: receipt number, date, cashier, item breakdown, totals, and payment info.
 *
 * @param {string} saleId - The ID of the sale to view
 */
function viewSaleDetails(saleId) {
  const sale = DB.getById('sales', saleId);
  if (!sale) return;

  // Build the sale details HTML
  let html = '';

  // Receipt info rows
  html += '<div class="sale-detail-row"><strong>Receipt No:</strong><span>' + sale.receiptNo + '</span></div>';
  html += '<div class="sale-detail-row"><strong>Date:</strong><span>' + formatDate(sale.date) + '</span></div>';
  html += '<div class="sale-detail-row"><strong>Cashier:</strong><span>' + sale.cashierName + '</span></div>';
  html += '<div class="sale-detail-row"><strong>Payment:</strong><span>' + getPaymentBadge(sale.paymentMethod) + '</span></div>';

  // Items table
  html += '<table class="sale-items-table">';
  html += '<thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Subtotal</th></tr></thead>';
  html += '<tbody>';
  sale.items.forEach(function (item) {
    html += ''
      + '<tr>'
      +   '<td>' + item.name + '</td>'
      +   '<td>' + formatCurrency(item.price) + '</td>'
      +   '<td>' + item.quantity + '</td>'
      +   '<td>' + formatCurrency(item.subtotal) + '</td>'
      + '</tr>';
  });
  html += '</tbody>';
  html += '</table>';

  // Total row
  html += '<div class="sale-total-row"><strong>Total:</strong><span>' + formatCurrency(sale.total) + '</span></div>';
  html += '<div class="sale-detail-row"><strong>Amount Paid:</strong><span>' + formatCurrency(sale.amountPaid) + '</span></div>';
  html += '<div class="sale-detail-row"><strong>Change:</strong><span>' + formatCurrency(sale.change) + '</span></div>';

  document.getElementById('saleDetailsBody').innerHTML = html;
  document.getElementById('saleModal').classList.add('show');
}

/**
 * Close the sale details modal.
 */
function closeSaleModal() {
  document.getElementById('saleModal').classList.remove('show');
}

/**
 * Export the currently filtered sales data as a CSV file.
 * Creates a downloadable file with columns for receipt, date, items, total, payment, and cashier.
 */
function exportSalesCSV() {
  const sales = getFilteredSales();

  if (sales.length === 0) {
    showNotification('No sales data to export', 'warning');
    return;
  }

  // Build the CSV string
  // Start with the header row
  let csv = 'Receipt No,Date,Items,Total (GHS),Payment Method,Cashier\n';

  // Add a row for each sale
  sales.forEach(function (sale) {
    // List item names separated by semicolons
    const itemNames = sale.items.map(function (item) {
      return item.name + ' x' + item.quantity;
    }).join('; ');

    // Wrap text fields in quotes to handle commas in product names
    csv += ''
      + '"' + sale.receiptNo + '",'
      + '"' + formatDate(sale.date) + '",'
      + '"' + itemNames + '",'
      + sale.total.toFixed(2) + ','
      + '"' + sale.paymentMethod + '",'
      + '"' + sale.cashierName + '"\n';
  });

  // Create a Blob (a file-like object) from the CSV string
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  // Create a temporary download link and click it
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'quickmart-sales-' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();

  // Clean up the temporary URL
  URL.revokeObjectURL(link.href);

  showNotification('Sales exported to CSV', 'success');
}


// ============================================================
// USER MANAGEMENT
// ============================================================

/**
 * Load and display all users in the Users table.
 * Shows each user's name, email, role, and action buttons.
 */
function loadUsers() {
  const users = DB.getAll('users');
  const tbody = document.getElementById('usersBody');

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found</td></tr>';
    return;
  }

  // Map role values to human-readable labels
  const roleLabels = {
    admin: 'Admin',
    cashier: 'Cashier',
    inventory: 'Inventory Manager'
  };

  let html = '';
  users.forEach(function (user) {
    html += ''
      + '<tr>'
      +   '<td>' + escapeHtml(user.name) + '</td>'
      +   '<td>' + escapeHtml(user.email) + '</td>'
      +   '<td>' + (user.username ? escapeHtml(user.username) : '<span class="text-muted">&#8212;</span>') + '</td>'
      +   '<td><span class="badge badge-info">' + (roleLabels[user.role] || user.role) + '</span></td>'
      +   '<td>'
      +     '<div class="action-btns">'
      +       '<button class="btn btn-sm btn-edit" onclick="openUserModal(\'' + user.id + '\')">Edit</button>'
      +       '<button class="btn btn-sm btn-delete" onclick="deleteUser(\'' + user.id + '\')">Delete</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  });

  tbody.innerHTML = html;
}

/**
 * Open the user modal for adding a new user or editing an existing one.
 * If a userId is provided, it pre-fills the form with that user's data.
 * When editing, the password field is left empty -- it will only update
 * if the admin types a new password.
 *
 * @param {string} [userId] - Optional. The ID of the user to edit.
 */
function openUserModal(userId) {
  // Reset all form fields
  document.getElementById('editUserId').value = '';
  document.getElementById('userFullName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRoleSelect').value = 'cashier';

  if (userId) {
    // --- EDIT MODE ---
    const user = DB.getById('users', userId);
    if (user) {
      document.getElementById('userModalTitle').textContent = 'Edit User';
      document.getElementById('editUserId').value = user.id;
      document.getElementById('userFullName').value = user.name;
      document.getElementById('userEmail').value = user.email;
      document.getElementById('userUsername').value = user.username || '';
      // Leave password blank -- only update if admin types a new one
      document.getElementById('userPassword').placeholder = 'Leave blank to keep current';
      document.getElementById('userRoleSelect').value = user.role;
    }
  } else {
    // --- ADD MODE ---
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userPassword').placeholder = 'Enter password';
  }

  // Show the modal
  document.getElementById('userModal').classList.add('show');
}

/**
 * Close the user modal and reset the form.
 */
function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
}

/**
 * Validate and save a user (either new or updated).
 * For edits, the password is only updated if the admin enters a new one.
 */
async function saveUser() {
  // Read form values
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('userFullName').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRoleSelect').value;

  // --- Validation ---
  if (!name) {
    showNotification('Please enter a full name', 'error');
    return;
  }
  if (!email) {
    showNotification('Please enter an email address', 'error');
    return;
  }

  // For new users, password is required
  if (!id && !password) {
    showNotification('Please enter a password', 'error');
    return;
  }

  if (id) {
    // --- UPDATE existing user ---
    // username is always sent: an empty string clears it, which is
    // how an admin takes a username back off an account.
    const updateData = {
      name: name,
      email: email,
      username: username,
      role: role
    };

    // Only update password if the admin typed a new one
    if (password) {
      updateData.password = password;
    }

    await DB.update('users', id, updateData);
    showNotification('User updated successfully', 'success');
  } else {
    // --- ADD new user ---
    // Check if email is already taken
    const existingUser = DB.query('users', function (u) {
      return u.email === email;
    });
    if (existingUser.length > 0) {
      showNotification('A user with this email already exists', 'error');
      return;
    }

    await DB.add('users', {
      name: name,
      email: email,
      username: username,
      password: password,
      role: role
    });
    showNotification('User added successfully', 'success');
  }

  // Close the modal and refresh the users table
  closeUserModal();
  loadUsers();
}

/**
 * Delete a user after confirmation.
 * Prevents the admin from deleting their own account.
 *
 * @param {string} id - The ID of the user to delete
 */
async function deleteUser(id) {
  // Get the currently logged-in user
  const currentUser = Auth.getCurrentUser();

  // Prevent self-deletion
  if (currentUser && currentUser.userId === id) {
    showNotification('You cannot delete your own account', 'error');
    return;
  }

  // Look up the user for a meaningful confirmation message
  const user = DB.getById('users', id);
  if (!user) return;

  const confirmed = confirm('Are you sure you want to delete user "' + user.name + '"?');
  if (confirmed) {
    await DB.delete('users', id);
    showNotification('User deleted successfully', 'success');
    loadUsers();
  }
}
