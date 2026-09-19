/**
 * ============================================================
 * cashier.js - Point of Sale (POS) Logic
 * ============================================================
 * This file powers the cashier page. It handles:
 *   - Loading and displaying products from the database
 *   - Searching and filtering products
 *   - Managing the shopping cart (add, remove, update qty)
 *   - Processing payments (Cash, MoMo, Card)
 *   - Saving sales to the database and deducting stock
 *   - Generating and printing receipts
 *
 * Depends on:
 *   - js/db.js   (localStorage database layer)
 *   - js/auth.js (authentication & session management)
 * ============================================================
 */


// ── GLOBAL STATE ─────────────────────────────────────────────
// These variables hold the current state of the POS session.

/**
 * The shopping cart - an array of items the customer is buying.
 * Each item looks like:
 *   { productId, name, price, quantity, subtotal }
 */
let cart = [];

/**
 * All products loaded from the database.
 * We keep a copy here so we don't have to re-read localStorage
 * every time we filter or search.
 */
let allProducts = [];

/**
 * The currently active category filter.
 * "All" means show every product.
 */
let activeCategory = 'All';

/**
 * The currently selected payment method.
 * Can be: null, "cash", "momo", or "card".
 */
let selectedPaymentMethod = null;

/**
 * The product currently matched by the barcode/code lookup.
 * Stored so "Add to Cart" can act on it without re-searching.
 */
let scannedProduct = null;

/**
 * Tax rate for calculations.
 * Ghana doesn't charge sales tax on most basic goods,
 * but we include it as a configurable value (0 = 0%).
 */
const TAX_RATE = 0;


// ── INITIALIZATION ───────────────────────────────────────────
// This runs when the page finishes loading.

document.addEventListener('DOMContentLoaded', async function () {

  // 1. Cashiers, admins and the owner can all use the till
  if (!Auth.requireRole(['cashier', 'admin', 'owner'])) return;

  // 2. Load this shop's branding and stock from the server
  try {
    await Shop.load();
    Shop.apply();
    await DB.init();
  } catch (error) {
    showNotification(error.message, 'error');
    return;
  }

  // 3. Display the cashier's name in the navbar
  const user = Auth.getCurrentUser();
  if (user) {
    document.getElementById('cashier-name').textContent = 'Cashier: ' + user.name;
  }

  // 4. Show today's date in the navbar
  document.getElementById('current-date').textContent = formatDate(new Date());

  // 5. Build the category buttons from THIS shop's own categories
  buildCategoryPills();

  // 6. Load and display all products
  loadProducts();

  // 6. Set up all event listeners (search, barcode, pills, etc.)
  setupEventListeners();
});


/**
 * Build the category filter buttons.
 *
 * These used to be typed into cashier.html by hand. Now every shop
 * defines its own categories, so a pharmacy sees "Antibiotics" while
 * a supermarket sees "Beverages" - from the same code.
 */
function buildCategoryPills() {
  const container = document.querySelector('.category-pills');
  if (!container) return;

  let html = '<button class="pill active" data-category="All">All</button>';

  DB.getAll('categories').forEach(function (category) {
    const name = escapeHtml(category.name);

    // A picture if the shop uploaded one, otherwise its emoji
    const badge = category.image_path
      ? '<img class="pill-thumb" src="' + encodeURI(category.image_path) + '" alt="">'
      : (category.icon ? escapeHtml(category.icon) + ' ' : '');

    html += '<button class="pill" data-category="' + name + '">' + badge + name + '</button>';
  });

  container.innerHTML = html;
}


// ── PRODUCT LOADING & DISPLAY ────────────────────────────────

/**
 * Load all products from the database and render them in the grid.
 * Also refreshes the local `allProducts` cache.
 */
function loadProducts() {
  // Fetch fresh data from DB (in case stock changed)
  allProducts = DB.getAll('products');

  // Apply the current category filter before rendering
  renderProductGrid(filterProductList(allProducts));
}

/**
 * Filter the product list based on the active category.
 * If category is "All", return everything.
 *
 * @param {Array} products - The full product list
 * @returns {Array} Filtered product list
 */
function filterProductList(products) {
  if (activeCategory === 'All') {
    return products;
  }
  // Only keep products whose category matches
  return products.filter(function (product) {
    return product.category === activeCategory;
  });
}

/**
 * Render product cards into the product grid.
 * Each card shows the product's name, price, stock, and an "Add" button.
 * Out-of-stock items get a dimmed overlay.
 *
 * @param {Array} products - Array of product objects to display
 */
function renderProductGrid(products) {
  const grid = document.getElementById('product-grid');

  // If no products match the filter/search, show a message
  if (products.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#aaa; padding:40px;">No products found.</p>';
    return;
  }

  // Build the HTML for each product card
  let html = '';
  products.forEach(function (product) {
    // Check if this product is out of stock
    const isOutOfStock = product.stock <= 0;

    // Check if stock is low (at or below minStock)
    const isLowStock = product.stock <= product.minStock && product.stock > 0;

    html += `
      <div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}"
           onclick="addToCart('${product.id}')">

        ${isOutOfStock ? '<span class="out-of-stock-overlay">Out of Stock</span>' : ''}

        <span class="product-name">${product.name}</span>
        <span class="product-code">${product.barcode}</span>
        <span class="product-price">${formatCurrency(product.price)}</span>
        <span class="product-stock ${isLowStock ? 'low-stock' : ''}">
          Stock: ${product.stock} ${product.unit}
        </span>
        <button class="btn-add" onclick="event.stopPropagation(); addToCart('${product.id}')">
          Add
        </button>
      </div>
    `;
  });

  grid.innerHTML = html;
}


// ── SEARCH & FILTER ──────────────────────────────────────────

/**
 * Filter products by a text query.
 * Searches both the product name and barcode (case-insensitive).
 *
 * @param {string} query - The search text
 */
function searchProducts(query) {
  // Convert query to lowercase for case-insensitive matching
  const lowerQuery = query.toLowerCase().trim();

  // If the search box is empty, just apply the category filter
  if (lowerQuery === '') {
    renderProductGrid(filterProductList(allProducts));
    return;
  }

  // Filter products where name or barcode contains the query
  const results = allProducts.filter(function (product) {
    const nameMatch = product.name.toLowerCase().includes(lowerQuery);
    const barcodeMatch = product.barcode.toLowerCase().includes(lowerQuery);
    return nameMatch || barcodeMatch;
  });

  renderProductGrid(results);
}

/**
 * Look up a product by barcode / product code from the scan bar.
 * Shows a preview strip with the product's code, name, and price.
 * If nothing is found, shows an error toast and hides the preview.
 */
function triggerBarcodeLookup() {
  const input = document.getElementById('barcode-input');
  const code = input.value.trim();

  // Hide any existing result first
  hideScanResult();

  if (!code) {
    showNotification('Please enter a barcode or product code.', 'info');
    return;
  }

  // Match by exact barcode (case-insensitive) or partial code search
  const match = allProducts.find(function (p) {
    return p.barcode.toLowerCase() === code.toLowerCase();
  });

  if (!match) {
    showNotification('No product found with code: ' + code, 'error');
    scannedProduct = null;
    return;
  }

  // Store matched product and show the preview strip
  scannedProduct = match;

  document.getElementById('scan-result-code').textContent = match.barcode;
  document.getElementById('scan-result-name').textContent = match.name;
  document.getElementById('scan-result-price').textContent = formatCurrency(match.price);

  const resultEl = document.getElementById('scan-result');
  resultEl.style.display = 'flex';
}

/**
 * Add the currently scanned product to the cart.
 * Called by the "+ Add to Cart" button in the scan preview strip.
 */
function addScannedProduct() {
  if (!scannedProduct) return;

  addToCart(scannedProduct.id);

  // Clear the barcode input and hide the preview
  document.getElementById('barcode-input').value = '';
  hideScanResult();
}

/**
 * Hide the scan result preview strip.
 */
function hideScanResult() {
  document.getElementById('scan-result').style.display = 'none';
  scannedProduct = null;
}


/**
 * Set the active category and re-render the product grid.
 * Also clears any active search text.
 *
 * @param {string} category - The category to filter by (e.g. "Beverages")
 */
function filterByCategory(category) {
  activeCategory = category;

  // Clear the search input when switching categories
  document.getElementById('search-input').value = '';

  // Update which pill looks "active"
  document.querySelectorAll('.pill').forEach(function (pill) {
    pill.classList.remove('active');
    if (pill.dataset.category === category) {
      pill.classList.add('active');
    }
  });

  // Re-render with the new filter
  renderProductGrid(filterProductList(allProducts));
}


// ── CART MANAGEMENT ──────────────────────────────────────────

/**
 * Add a product to the cart (or increase its quantity if already there).
 * Checks that enough stock is available before adding.
 *
 * @param {string} productId - The ID of the product to add
 */
/**
 * Ids from the server are numbers, ids from the DOM are strings
 * (an onclick attribute can only carry text). Comparing them with
 * === silently fails, so every lookup here goes through this.
 * Same rule as DB.getById in db.js.
 */
function sameId(a, b) {
  return String(a) === String(b);
}

function addToCart(productId) {
  // Look up the product from our cached list
  const product = allProducts.find(function (p) {
    return sameId(p.id, productId);
  });

  // Safety check: does this product exist?
  if (!product) {
    showNotification('Product not found.', 'error');
    return;
  }

  // Check if this product is already in the cart
  const existingItem = cart.find(function (item) {
    return sameId(item.productId, productId);
  });

  if (existingItem) {
    // Product is already in cart -- try to increase quantity
    if (existingItem.quantity >= product.stock) {
      showNotification('Cannot add more. Only ' + product.stock + ' in stock.', 'error');
      return;
    }
    existingItem.quantity += 1;
    existingItem.subtotal = existingItem.quantity * existingItem.price;
  } else {
    // Product is not in cart yet -- add it as a new item
    if (product.stock <= 0) {
      showNotification('This product is out of stock.', 'error');
      return;
    }

    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      subtotal: product.price
    });
  }

  // Update the cart display
  renderCart();
  showNotification(product.name + ' added to cart.', 'success');
}

/**
 * Remove a product completely from the cart.
 *
 * @param {string} productId - The ID of the product to remove
 */
function removeFromCart(productId) {
  // Filter out the item with the matching productId
  cart = cart.filter(function (item) {
    return !sameId(item.productId, productId);
  });

  renderCart();
  showNotification('Item removed from cart.', 'info');
}

/**
 * Change the quantity of a cart item by a given amount (+1 or -1).
 * Ensures quantity stays between 1 and the available stock.
 *
 * @param {string} productId - The ID of the product
 * @param {number} change    - How much to change (+1 to increase, -1 to decrease)
 */
function updateQuantity(productId, change) {
  // Find the item in the cart
  const item = cart.find(function (i) {
    return sameId(i.productId, productId);
  });

  if (!item) return;

  // Find the product to check stock limits
  const product = allProducts.find(function (p) {
    return sameId(p.id, productId);
  });

  const newQty = item.quantity + change;

  // Don't allow quantity below 1
  if (newQty < 1) {
    showNotification('Minimum quantity is 1. Use X to remove.', 'info');
    return;
  }

  // Don't allow quantity above available stock
  if (newQty > product.stock) {
    showNotification('Only ' + product.stock + ' available in stock.', 'error');
    return;
  }

  // Update the quantity and recalculate subtotal
  item.quantity = newQty;
  item.subtotal = item.quantity * item.price;

  renderCart();
}

/**
 * Empty the entire cart.
 */
function clearCart() {
  if (cart.length === 0) return;

  cart = [];
  selectedPaymentMethod = null;
  renderCart();
  resetPaymentSection();
  hideScanResult();
  document.getElementById('barcode-input').value = '';
  showNotification('Cart cleared.', 'info');
}

/**
 * Render the cart items list, summary, and update the badge count.
 */
function renderCart() {
  const cartContainer = document.getElementById('cart-items');
  const cartCount = document.getElementById('cart-count');

  // Update the badge with total number of items
  const totalItems = cart.reduce(function (sum, item) {
    return sum + item.quantity;
  }, 0);
  cartCount.textContent = totalItems;

  // If cart is empty, show placeholder message
  if (cart.length === 0) {
    cartContainer.innerHTML = '<p class="empty-cart-msg">Cart is empty. Add products to get started.</p>';
    updateCartSummary();
    validatePayment();
    return;
  }

  // Build the HTML for each cart item
  let html = '';
  cart.forEach(function (item) {
    html += `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatCurrency(item.price)} each</div>
        </div>

        <div class="qty-controls">
          <button class="qty-btn" onclick="updateQuantity('${item.productId}', -1)">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity('${item.productId}', +1)">+</button>
        </div>

        <span class="cart-item-subtotal">${formatCurrency(item.subtotal)}</span>

        <button class="btn-remove" onclick="removeFromCart('${item.productId}')" title="Remove item">
          &times;
        </button>
      </div>
    `;
  });

  cartContainer.innerHTML = html;
  updateCartSummary();
  validatePayment();
}

/**
 * Calculate the cart totals and update the summary display.
 *
 * @returns {Object} An object with { subtotal, tax, total }
 */
function calculateTotal() {
  // Sum all item subtotals
  const subtotal = cart.reduce(function (sum, item) {
    return sum + item.subtotal;
  }, 0);

  // Calculate tax (currently 0%)
  const tax = subtotal * TAX_RATE;

  // Grand total
  const total = subtotal + tax;

  return { subtotal, tax, total };
}

/**
 * Update the subtotal, tax, and total displays in the cart summary.
 */
function updateCartSummary() {
  const totals = calculateTotal();

  document.getElementById('cart-subtotal').textContent = formatCurrency(totals.subtotal);
  document.getElementById('cart-tax').textContent = formatCurrency(totals.tax);
  document.getElementById('cart-total').textContent = formatCurrency(totals.total);
}


// ── PAYMENT HANDLING ─────────────────────────────────────────

/**
 * Select a payment method and show the relevant input fields.
 * Hides fields for other payment methods.
 *
 * @param {string} method - "cash", "momo", or "card"
 */
function selectPaymentMethod(method) {
  selectedPaymentMethod = method;

  // Update button styles: make the selected one "active"
  document.querySelectorAll('.pay-method-btn').forEach(function (btn) {
    btn.classList.remove('active');
    if (btn.dataset.method === method) {
      btn.classList.add('active');
    }
  });

  // Hide all payment field groups first
  document.getElementById('cash-fields').style.display = 'none';
  document.getElementById('momo-fields').style.display = 'none';
  document.getElementById('card-fields').style.display = 'none';

  // Show the relevant fields based on method
  if (method === 'cash') {
    document.getElementById('cash-fields').style.display = 'block';
    document.getElementById('amount-tendered').value = '';
    document.getElementById('change-amount').textContent = formatCurrency(0);
  } else if (method === 'momo') {
    document.getElementById('momo-fields').style.display = 'block';
  } else if (method === 'card') {
    document.getElementById('card-fields').style.display = 'block';
  }

  // Re-check if the Complete Sale button should be enabled
  validatePayment();
}

/**
 * Reset the payment section to its initial state.
 * Called when the cart is cleared or a new sale starts.
 */
function resetPaymentSection() {
  selectedPaymentMethod = null;

  // Remove active state from all payment buttons
  document.querySelectorAll('.pay-method-btn').forEach(function (btn) {
    btn.classList.remove('active');
  });

  // Hide all payment fields
  document.getElementById('cash-fields').style.display = 'none';
  document.getElementById('momo-fields').style.display = 'none';
  document.getElementById('card-fields').style.display = 'none';

  // Reset input values
  document.getElementById('amount-tendered').value = '';
  document.getElementById('change-amount').textContent = formatCurrency(0);
  document.getElementById('momo-number').value = '';
  document.getElementById('momo-provider').value = '';

  // Disable the Complete Sale button
  document.getElementById('complete-sale-btn').disabled = true;
}

/**
 * Check whether the payment info is complete and enable/disable
 * the "Complete Sale" button accordingly.
 */
function validatePayment() {
  const btn = document.getElementById('complete-sale-btn');
  const totals = calculateTotal();

  // Can't complete if the cart is empty
  if (cart.length === 0 || !selectedPaymentMethod) {
    btn.disabled = true;
    return;
  }

  // Validate based on the selected payment method
  if (selectedPaymentMethod === 'cash') {
    const tendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    // Cash tendered must be enough to cover the total
    btn.disabled = tendered < totals.total;

  } else if (selectedPaymentMethod === 'momo') {
    const provider = document.getElementById('momo-provider').value;
    const number = document.getElementById('momo-number').value.trim();
    // Both provider and number are required
    btn.disabled = !provider || !number;

  } else if (selectedPaymentMethod === 'card') {
    // Card just needs a payment method selection -- no extra fields
    btn.disabled = false;
  }
}

/**
 * Calculate and display the change amount when cash is tendered.
 * Called every time the "Amount Tendered" input changes.
 */
function calculateChange() {
  const totals = calculateTotal();
  const tendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
  const change = Math.max(0, tendered - totals.total);

  document.getElementById('change-amount').textContent = formatCurrency(change);

  // Also re-validate the Complete Sale button
  validatePayment();
}


// ── COMPLETING A SALE ────────────────────────────────────────

/**
 * Process the sale: validate everything, save to database,
 * deduct stock, and show the receipt.
 */
async function completeSale() {
  // -- Validation checks --

  if (cart.length === 0) {
    showNotification('Cart is empty. Add items first.', 'error');
    return;
  }

  if (!selectedPaymentMethod) {
    showNotification('Please select a payment method.', 'error');
    return;
  }

  const totals = calculateTotal();
  let amountPaid = 0;
  let change = 0;

  // Gather payment-specific details
  if (selectedPaymentMethod === 'cash') {
    amountPaid = parseFloat(document.getElementById('amount-tendered').value) || 0;
    if (amountPaid < totals.total) {
      showNotification('Amount tendered is less than the total.', 'error');
      return;
    }
    change = amountPaid - totals.total;

  } else if (selectedPaymentMethod === 'momo') {
    const provider = document.getElementById('momo-provider').value;
    const number = document.getElementById('momo-number').value.trim();
    if (!provider || !number) {
      showNotification('Please fill in MoMo provider and number.', 'error');
      return;
    }
    amountPaid = totals.total;  // MoMo pays exact amount
    change = 0;

  } else if (selectedPaymentMethod === 'card') {
    amountPaid = totals.total;  // Card pays exact amount
    change = 0;
  }

  // -- Build the sale record --

  const user = Auth.getCurrentUser();

  // Build the request. Notice we only send product ids and
  // quantities - the server looks up the real prices itself, so a
  // tampered page cannot sell a bag of rice for one cedi.
  const request = {
    items: cart.map(function (item) {
      return { productId: item.productId, quantity: item.quantity };
    }),
    paymentMethod: selectedPaymentMethod,
    amountPaid: amountPaid
  };

  if (selectedPaymentMethod === 'momo') {
    request.momoProvider = document.getElementById('momo-provider').value;
    request.momoNumber = document.getElementById('momo-number').value.trim();
  }

  // Stop double-clicks creating two sales
  const completeBtn = document.getElementById('complete-sale-btn');
  completeBtn.disabled = true;
  completeBtn.textContent = 'Processing...';

  let receipt;

  try {
    // ONE call. The server checks stock, prices the cart, takes the
    // next receipt number, cuts stock and writes the audit trail -
    // all inside a database transaction.
    receipt = await API.sales.create(request);
  } catch (error) {
    showNotification(error.message, 'error');
    completeBtn.disabled = false;
    completeBtn.textContent = 'Complete Sale';
    return;
  }

  completeBtn.textContent = 'Complete Sale';

  // Stock numbers changed, so pull fresh product data
  await DB.refresh('products');
  loadProducts();

  // Show the receipt, already carrying this shop's branding
  generateReceipt(receipt);

  const receiptNo = receipt.receiptNo;
  showNotification('Sale completed! Receipt #' + receiptNo, 'success');
}


// ── RECEIPT GENERATION ───────────────────────────────────────

/**
 * Build the receipt HTML and display it in the modal.
 * Styled to look like a thermal printer receipt.
 *
 * @param {Object} sale - The completed sale record
 */
function generateReceipt(receipt) {
  // The receipt HTML is built in js/shop.js from the data the server
  // sent back, which already contains THIS shop's name, logo, TIN,
  // address, MoMo number and footer message.
  //
  // That is why the same code prints a QuickMart receipt for
  // QuickMart and a Melcom receipt for Melcom, with nothing
  // hardcoded anywhere.
  document.getElementById('receipt-content').innerHTML = Shop.receiptHtml(receipt);
  document.getElementById('receipt-modal').style.display = 'flex';
}

/**
 * Trigger the browser's print dialog.
 * The CSS @media print rules ensure only the receipt is printed.
 */
function printReceipt() {
  window.print();
}

/**
 * Close the receipt modal and reset everything for the next customer.
 */
function newSale() {
  // Hide the receipt modal
  document.getElementById('receipt-modal').style.display = 'none';

  // Clear the cart
  cart = [];

  // Reset payment section
  resetPaymentSection();

  // Clear scan state
  hideScanResult();
  document.getElementById('barcode-input').value = '';

  // Re-render the empty cart
  renderCart();

  // Refresh products (stock may have changed)
  loadProducts();

  showNotification('Ready for next customer!', 'info');
}


// ── EVENT LISTENERS ──────────────────────────────────────────

/**
 * Set up all the event listeners for the POS page.
 * Called once during initialization.
 */
function setupEventListeners() {

  // -- Search input: filter products as the user types --
  document.getElementById('search-input').addEventListener('input', function (e) {
    searchProducts(e.target.value);
  });

  // -- Barcode input: lookup on Enter key (shows preview strip) --
  document.getElementById('barcode-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerBarcodeLookup();
    }
  });

  // -- Barcode input: hide result when field is cleared --
  document.getElementById('barcode-input').addEventListener('input', function (e) {
    if (!e.target.value.trim()) {
      hideScanResult();
    }
  });

  // -- Category pills: filter by category --
  document.querySelectorAll('.pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      filterByCategory(pill.dataset.category);
    });
  });

  // -- Clear Cart button --
  document.getElementById('clear-cart-btn').addEventListener('click', clearCart);

  // -- Payment method buttons --
  document.querySelectorAll('.pay-method-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectPaymentMethod(btn.dataset.method);
    });
  });

  // -- Cash: recalculate change when amount tendered changes --
  document.getElementById('amount-tendered').addEventListener('input', calculateChange);

  // -- MoMo: re-validate when provider or number changes --
  document.getElementById('momo-provider').addEventListener('change', validatePayment);
  document.getElementById('momo-number').addEventListener('input', validatePayment);

  // -- Complete Sale button --
  document.getElementById('complete-sale-btn').addEventListener('click', completeSale);

  // -- Receipt modal buttons --
  document.getElementById('print-receipt-btn').addEventListener('click', printReceipt);
  document.getElementById('new-sale-btn').addEventListener('click', newSale);

  // -- Close modal if user clicks outside the receipt paper --
  document.getElementById('receipt-modal').addEventListener('click', function (e) {
    // Only close if they clicked the overlay itself, not the receipt
    if (e.target === this) {
      newSale();
    }
  });
}


// ── MY SALES TODAY ───────────────────────────────────────────

/**
 * Show this cashier what they have taken today.
 *
 * The server works out whose sales these are from the login token,
 * so a cashier only ever sees their own figures - there is no id
 * in the request that could be changed to peek at a colleague's.
 */
async function openMySales() {
  const modal = document.getElementById('my-sales-modal');
  const body = document.getElementById('my-sales-body');

  body.innerHTML = '<p class="my-sales-loading">Loading...</p>';
  modal.style.display = 'flex';

  try {
    const day = await API.reports.mySales();
    body.innerHTML = renderMySales(day);
  } catch (error) {
    body.innerHTML = '<p class="my-sales-error">Could not load your sales: '
      + escapeHtml(error.message) + '</p>';
  }
}

function closeMySales() {
  document.getElementById('my-sales-modal').style.display = 'none';
}

/**
 * Build the summary. Cash is shown first and largest because it is
 * the only figure the cashier has to physically count and hand over.
 */
function renderMySales(day) {
  const receipts = day.receipts.length
    ? day.receipts.map(function (r) {
        return '<tr>'
          + '<td>' + escapeHtml(r.time) + '</td>'
          + '<td>' + escapeHtml(r.receipt_no) + '</td>'
          + '<td class="method">' + escapeHtml(r.payment_method) + '</td>'
          + '<td class="amount">' + formatCurrency(Number(r.total)) + '</td>'
          + '</tr>';
      }).join('')
    : '<tr><td colspan="4" class="my-sales-empty">No sales yet today.</td></tr>';

  const voided = day.voidedCount > 0
    ? '<p class="my-sales-voided">' + day.voidedCount
      + ' voided sale' + (day.voidedCount === 1 ? '' : 's')
      + ' today (not counted above).</p>'
    : '';

  return ''
    + '<div class="my-sales-summary">'
    +   '<div class="my-sales-total">'
    +     '<span class="label">Total taken</span>'
    +     '<span class="value">' + formatCurrency(day.totalTaken) + '</span>'
    +     '<span class="count">' + day.transactions
    +       ' sale' + (day.transactions === 1 ? '' : 's') + '</span>'
    +   '</div>'
    +   '<div class="my-sales-split">'
    +     '<div class="split-row cash"><span>Cash in drawer</span><strong>'
    +       formatCurrency(day.cash) + '</strong></div>'
    +     '<div class="split-row"><span>Mobile Money</span><strong>'
    +       formatCurrency(day.momo) + '</strong></div>'
    +     '<div class="split-row"><span>Card</span><strong>'
    +       formatCurrency(day.card) + '</strong></div>'
    +   '</div>'
    + '</div>'
    + voided
    + '<table class="my-sales-table">'
    +   '<thead><tr><th>Time</th><th>Receipt</th><th>Paid by</th><th class="amount">Amount</th></tr></thead>'
    +   '<tbody>' + receipts + '</tbody>'
    + '</table>';
}


// ── UTILITY / HELPER FUNCTIONS ───────────────────────────────

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
 * Format a Date object as a readable date string.
 * Example: "13 Apr 2026"
 *
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options);
}

/**
 * Format a Date object as a time string.
 * Example: "09:15 AM"
 *
 * @param {Date} date - The date to extract time from
 * @returns {string} Formatted time string
 */
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Show a toast notification message.
 * The toast appears in the top-right corner and disappears after 3 seconds.
 *
 * @param {string} message - The message to display
 * @param {string} type    - "success", "error", or "info"
 */
function showNotification(message, type) {
  const container = document.getElementById('notification-container');

  // Create the toast element
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;

  // Add it to the container
  container.appendChild(toast);

  // Automatically remove it after 3 seconds
  setTimeout(function () {
    toast.classList.add('fade-out');

    // Wait for the fade-out animation to finish, then remove
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}
