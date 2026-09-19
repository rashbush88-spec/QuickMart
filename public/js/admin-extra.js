/**
 * ============================================================
 *  js/admin-extra.js - the two new tabs
 * ============================================================
 *  Categories     - each shop manages its own product categories
 *  Settings       - shop details, receipt branding, logo, billing
 *  Staff Activity - who was on duty, and what the cashiers took
 *
 *  Kept in a separate file so admin.js stays as you wrote it.
 * ============================================================
 */

function initExtras() {
  // Fill the product form's category dropdown from this shop's
  // categories instead of the list that used to be typed into
  // admin.html by hand.
  refreshCategoryDropdowns();
}


// ══════════════════════════════════════════════════════════════
//  CATEGORIES
// ══════════════════════════════════════════════════════════════

/**
 * The little square at the start of each row: the category's
 * picture if it has one, its emoji if not, a plain box otherwise.
 */
function categoryThumb(category) {
  if (category.image_path) {
    return `<img class="cat-thumb" src="${encodeURI(category.image_path)}" alt="${escapeHtml(category.name)}">`;
  }

  return `<span class="cat-thumb cat-thumb-emoji">${category.icon ? escapeHtml(category.icon) : '&#128230;'}</span>`;
}

async function loadCategories() {
  const tbody = document.getElementById('categoriesBody');
  const categories = DB.getAll('categories');

  if (categories.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="4" class="empty-state">
        <strong>No categories yet.</strong><br>
        Create the ones your shop actually sells &#8212; add a picture for each
        so your cashiers can spot them on the till.<br><br>
        <button class="btn btn-primary" style="width:auto" onclick="openCategoryModal()">Add your first category</button>
      </td></tr>`;
    return;
  }

  let html = '';

  categories.forEach(function (category) {
    html += `
      <tr>
        <td>${categoryThumb(category)}</td>
        <td><strong>${escapeHtml(category.name)}</strong></td>
        <td>${category.product_count || 0}</td>
        <td>
          <div class="action-btns">
            <button class="btn-edit" onclick="openCategoryModal(${category.id})">Edit</button>
            <button class="btn-delete" onclick="deleteCategory(${category.id})">Delete</button>
          </div>
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

function openCategoryModal(id) {
  document.getElementById('editCategoryId').value = id || '';
  document.getElementById('categoryModalTitle').textContent = id ? 'Edit Category' : 'Add Category';

  const category = id ? DB.getAll('categories').find(c => c.id === id) : null;

  document.getElementById('catName').value = category ? category.name : '';
  document.getElementById('catIcon').value = category ? (category.icon || '') : '';

  // Clear any file picked the last time the modal was open
  document.getElementById('catImageFile').value = '';

  showCategoryPreview(category);
  document.getElementById('categoryModal').classList.add('show');
}

/**
 * Paint the preview square. Pass a category to show what is
 * saved, or a data URL to show a file the user just picked.
 */
function showCategoryPreview(category, dataUrl) {
  const preview   = document.getElementById('catPicturePreview');
  const removeBtn = document.getElementById('catRemoveImageBtn');

  if (dataUrl) {
    preview.innerHTML = `<img src="${dataUrl}" alt="">`;
    removeBtn.style.display = 'none';
    return;
  }

  if (category && category.image_path) {
    preview.innerHTML = `<img src="${encodeURI(category.image_path)}" alt="">`;
    removeBtn.style.display = '';
    return;
  }

  preview.innerHTML = `<span>${category && category.icon ? escapeHtml(category.icon) : '&#128230;'}</span>`;
  removeBtn.style.display = 'none';
}

/** Show the picked file straight away, before it is uploaded. */
function previewCategoryImage() {
  const file = document.getElementById('catImageFile').files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    document.getElementById('catImageFile').value = '';
    return showNotification('That picture is bigger than 2 MB. Please pick a smaller one.', 'error');
  }

  const reader = new FileReader();
  reader.onload = e => showCategoryPreview(null, e.target.result);
  reader.readAsDataURL(file);
}

async function removeCategoryImage() {
  const id = document.getElementById('editCategoryId').value;
  if (!id) return;

  try {
    await API.categories.removeImage(id);
    await DB.refresh('categories');

    showCategoryPreview(DB.getAll('categories').find(c => c.id === Number(id)));
    loadCategories();
    showNotification('Picture removed.', 'success');
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('show');
}

async function saveCategory() {
  const id   = document.getElementById('editCategoryId').value;
  const name = document.getElementById('catName').value.trim();
  const icon = document.getElementById('catIcon').value.trim();
  const file = document.getElementById('catImageFile').files[0];

  if (!name) {
    return showNotification('Please enter a category name.', 'error');
  }

  try {
    // The picture is a second request, so the category has to
    // exist first - that is where its id comes from.
    let categoryId = id;

    if (id) {
      await API.categories.update(id, { name, icon });
    } else {
      const created = await API.categories.create({ name, icon });
      categoryId = created.id;
    }

    if (file) {
      await API.categories.uploadImage(categoryId, file);
    }

    await DB.refresh('categories');
    closeCategoryModal();
    loadCategories();
    refreshCategoryDropdowns();
    showNotification('Category saved.', 'success');

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function deleteCategory(id) {
  const category = DB.getAll('categories').find(c => c.id === id);

  if (!confirm(`Delete "${category.name}"? Its products stay in your shop but become uncategorised.`)) {
    return;
  }

  try {
    await API.categories.remove(id);
    await DB.refresh('categories');
    await DB.refresh('products');
    loadCategories();
    refreshCategoryDropdowns();
    showNotification('Category deleted.', 'success');
  } catch (error) {
    showNotification(error.message, 'error');
  }
}


// ══════════════════════════════════════════════════════════════
//  SHOP SETTINGS
// ══════════════════════════════════════════════════════════════

async function loadSettings() {
  try {
    const shop = await API.shop.get();

    setValue('setName',           shop.name);
    setValue('setSlogan',         shop.slogan);
    setValue('setPhone',          shop.phone);
    setValue('setTin',            shop.tin);
    setValue('setAddress',        shop.address);
    setValue('setCity',           shop.city);
    setValue('setRegion',         shop.region);
    setValue('setDigitalAddress', shop.digital_address);
    setValue('setPrefix',         shop.receipt_prefix);
    setValue('setTaxRate',        shop.tax_rate);
    setValue('setTaxLabel',       shop.tax_label);
    setValue('setCurrency',       shop.currency_symbol);
    setValue('setHeader',         shop.receipt_header);
    setValue('setFooter',         shop.receipt_footer);
    setValue('setMomoProvider',   shop.momo_provider);
    setValue('setMomoNumber',     shop.momo_number);
    setValue('setMomoName',       shop.momo_name);

    if (shop.logo_path) {
      document.querySelectorAll('[data-shop-logo]').forEach(element => {
        element.innerHTML = `<img src="${shop.logo_path}" alt="Logo" style="max-height:70px">`;
      });
    }

    loadBilling();

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function saveSettings() {
  const details = {
    name:            getValue('setName'),
    slogan:          getValue('setSlogan'),
    phone:           getValue('setPhone'),
    tin:             getValue('setTin'),
    address:         getValue('setAddress'),
    city:            getValue('setCity'),
    region:          getValue('setRegion'),
    digital_address: getValue('setDigitalAddress'),
    receipt_prefix:  getValue('setPrefix'),
    tax_rate:        Number(getValue('setTaxRate')) || 0,
    tax_label:       getValue('setTaxLabel') || 'Tax',
    currency_symbol: getValue('setCurrency') || 'GH\u20b5',
    receipt_header:  getValue('setHeader'),
    receipt_footer:  getValue('setFooter'),
    momo_provider:   getValue('setMomoProvider') || null,
    momo_number:     getValue('setMomoNumber'),
    momo_name:       getValue('setMomoName')
  };

  if (!details.name) {
    return showNotification('Your shop needs a name.', 'error');
  }

  try {
    await API.shop.update(details);

    // Upload the logo if one was picked
    const fileInput = document.getElementById('setLogo');
    if (fileInput && fileInput.files.length > 0) {
      await API.shop.uploadLogo(fileInput.files[0]);
      fileInput.value = '';
    }

    // Refresh the cached branding so the change shows immediately
    await Shop.load(true);
    Shop.apply();

    showNotification('Saved. Your next receipt will use these details.', 'success');

  } catch (error) {
    showNotification(error.message, 'error');
  }
}


// ══════════════════════════════════════════════════════════════
//  BILLING
// ══════════════════════════════════════════════════════════════

async function loadBilling() {
  const summary = document.getElementById('billingSummary');

  try {
    const data = await API.subscription.current();
    const sub = data.subscription;

    if (!sub) {
      summary.innerHTML = '<p class="text-muted">No subscription on record.</p>';
    } else {
      const daysLeft = sub.days_left;
      const state = daysLeft < 0 ? 'danger' : (daysLeft <= 7 ? 'warning' : 'success');
      const endsOn = String(sub.ends_on || '').slice(0, 10);

      summary.innerHTML = `
        <div class="billing-summary">
          <div>
            <h4>${sub.plan_name || 'Trial'}</h4>
            <span class="badge badge-${state}">
              ${daysLeft < 0 ? 'Expired' : daysLeft + ' days left'}
            </span>
            <p class="text-muted mt-2">Renews on ${endsOn}</p>
          </div>
          <div class="usage">
            <div>Staff: <strong>${data.usage.staff_used}</strong> / ${sub.max_users > 0 ? sub.max_users : '&#8734;'}</div>
            <div>Products: <strong>${data.usage.products_used}</strong> / ${sub.max_products > 0 ? sub.max_products : '&#8734;'}</div>
          </div>
        </div>
        ${data.paymentMode === 'demo'
          ? '<p class="demo-note">Demo mode is on. Choosing a plan activates it right away with no real payment.</p>'
          : ''}`;
    }

    // The plans they can move to
    const plans = await API.subscription.plans();
    document.getElementById('planList').innerHTML = plans.map(plan => `
      <div class="plan-card">
        <h4>${plan.name}</h4>
        <div class="plan-card-price">GH&#8373; ${Number(plan.price_monthly).toFixed(0)}<small>/mo</small></div>
        <ul>${plan.features.map(f => '<li>' + f + '</li>').join('')}</ul>
        <button class="btn btn-primary btn-sm" onclick="choosePlan('${plan.code}')">
          Choose ${plan.name}
        </button>
      </div>`).join('');

    // Payment history
    const payments = await API.subscription.payments();
    const tbody = document.getElementById('paymentsBody');

    tbody.innerHTML = payments.length === 0
      ? '<tr><td colspan="5" class="empty-state">No payments yet.</td></tr>'
      : payments.map(p => `
          <tr>
            <td>${String(p.paid_at || p.created_at).slice(0, 10)}</td>
            <td>GH&#8373; ${Number(p.amount).toFixed(2)}</td>
            <td>${p.provider || p.method}</td>
            <td><small>${p.reference}</small></td>
            <td><span class="badge badge-${p.status === 'success' ? 'success' : 'warning'}">${p.status}</span></td>
          </tr>`).join('');

  } catch (error) {
    summary.innerHTML = `<p class="text-danger">${error.message}</p>`;
  }
}

async function choosePlan(planCode) {
  if (!confirm(`Switch to the ${planCode} plan?`)) return;

  try {
    const result = await API.subscription.subscribe({ planCode, billingCycle: 'monthly' });

    // Live mode sends them to Paystack; demo mode is done already
    if (result.mode === 'live' && result.authorizationUrl) {
      window.location.href = result.authorizationUrl;
      return;
    }

    showNotification(result.message, 'success');
    loadBilling();

  } catch (error) {
    showNotification(error.message, 'error');
  }
}


// ══════════════════════════════════════════════════════════════
//  Small helpers
// ══════════════════════════════════════════════════════════════

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value === null || value === undefined ? '' : value;
}

function getValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : '';
}


// ════════════════════════════════════════════════════════════
//  STAFF ACTIVITY
//  When each staff member logged in and out, and - for
//  cashiers - what they took while they were on duty.
// ════════════════════════════════════════════════════════════

/**
 * Load the staff activity table for the chosen date.
 * Defaults to today the first time the tab is opened.
 */
let staffActivityStaff = [];

async function loadStaffActivity() {
  const picker = document.getElementById('activityDate');
  const body = document.getElementById('staffActivityBody');

  if (!picker.value) {
    picker.value = new Date().toLocaleDateString('en-CA');
  }

  document.getElementById('cashierDayCard').style.display = 'none';
  body.innerHTML = '<tr><td colspan="8" class="activity-empty">Loading...</td></tr>';

  try {
    const report = await API.reports.staffActivity(picker.value);
    staffActivityStaff = report.staff;

    if (report.staff.length === 0) {
      body.innerHTML = '<tr><td colspan="8" class="activity-empty">'
        + 'Nobody logged in on this day.</td></tr>';
      return;
    }

    body.innerHTML = report.staff.map(renderStaffRow).join('');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="8" class="activity-empty">'
      + escapeHtml(error.message) + '</td></tr>';
  }
}

/**
 * One row per staff member. Somebody who signed in more than once
 * in a day gets a line per session, so a split shift is visible
 * rather than averaged away.
 */
function renderStaffRow(person) {
  const sessions = person.sessions.length ? person.sessions : [null];

  return sessions.map(function (session, index) {
    // Only the first line of a person repeats their name and totals
    const first = index === 0;

    const name = first
      ? '<strong>' + escapeHtml(person.name) + '</strong>'
      : '';

    const role = first
      ? '<span class="role-pill role-' + escapeHtml(person.role) + '">'
        + escapeHtml(person.role) + '</span>'
      : '';

    if (!session) {
      return '<tr><td>' + name + '</td><td>' + role + '</td>'
        + '<td colspan="3" class="activity-none">No login recorded</td>'
        + '<td>' + person.transactions + '</td>'
        + '<td>' + formatCurrency(person.totalTaken) + '</td><td></td></tr>';
    }

    // A session with no logout was abandoned - the browser was just
    // closed - so last_seen is the honest answer, flagged as such.
    const out = session.logoutTime
      ? escapeHtml(session.logoutTime)
      : '<span class="activity-open" title="Never clicked Log Out">'
        + escapeHtml(session.lastSeenTime) + ' (last seen)</span>';

    const canDrillIn = first && person.role === 'cashier';

    // Only the id goes in the attribute. Names containing a quote or
    // an apostrophe - O'Brien - would otherwise break straight out of
    // the onclick and leave the button dead.
    const action = canDrillIn
      ? '<button class="btn btn-small" onclick="openCashierDay(' + person.userId
        + ')">View sales</button>'
      : '';

    return '<tr>'
      + '<td>' + name + '</td>'
      + '<td>' + role + '</td>'
      + '<td>' + escapeHtml(session.loginTime) + '</td>'
      + '<td>' + out + '</td>'
      + '<td>' + formatDuration(session.minutes) + '</td>'
      + '<td>' + (first ? person.transactions : '') + '</td>'
      + '<td>' + (first ? formatCurrency(person.totalTaken) : '') + '</td>'
      + '<td>' + action + '</td>'
      + '</tr>';
  }).join('');
}

/**
 * 0 -> "just now", 95 -> "1h 35m"
 */
function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return minutes + 'm';

  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
}

/**
 * Open one cashier's receipts for the selected day.
 */
async function openCashierDay(userId) {
  const card = document.getElementById('cashierDayCard');
  const date = document.getElementById('activityDate').value;
  const person = staffActivityStaff.find(function (p) { return p.userId === userId; });
  const cashierName = person ? person.name : 'Cashier';

  card.style.display = 'block';
  card.innerHTML = '<p class="activity-empty">Loading...</p>';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const day = await API.reports.cashierSales(userId, date);

    const rows = day.receipts.length
      ? day.receipts.map(function (r) {
          return '<tr><td>' + escapeHtml(r.time) + '</td>'
            + '<td>' + escapeHtml(r.receipt_no) + '</td>'
            + '<td class="method">' + escapeHtml(r.payment_method) + '</td>'
            + '<td class="amount">' + formatCurrency(Number(r.total)) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="activity-empty">No sales on this day.</td></tr>';

    card.innerHTML = ''
      + '<div class="cashier-day-header">'
      +   '<h3>' + escapeHtml(cashierName) + ' &mdash; ' + escapeHtml(day.date) + '</h3>'
      +   '<button class="btn btn-small" onclick="closeCashierDay()">Close</button>'
      + '</div>'
      + '<div class="cashier-day-totals">'
      +   '<div><span>Sales</span><strong>' + day.transactions + '</strong></div>'
      +   '<div><span>Total taken</span><strong>' + formatCurrency(day.totalTaken) + '</strong></div>'
      +   '<div><span>Cash</span><strong>' + formatCurrency(day.cash) + '</strong></div>'
      +   '<div><span>MoMo</span><strong>' + formatCurrency(day.momo) + '</strong></div>'
      +   '<div><span>Card</span><strong>' + formatCurrency(day.card) + '</strong></div>'
      + '</div>'
      + '<div class="table-container"><table>'
      +   '<thead><tr><th>Time</th><th>Receipt</th><th>Paid by</th><th class="amount">Amount</th></tr></thead>'
      +   '<tbody>' + rows + '</tbody>'
      + '</table></div>';
  } catch (error) {
    card.innerHTML = '<p class="activity-empty">' + escapeHtml(error.message) + '</p>';
  }
}

function closeCashierDay() {
  document.getElementById('cashierDayCard').style.display = 'none';
}
