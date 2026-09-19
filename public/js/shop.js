/**
 * ============================================================
 *  js/shop.js - this shop's identity
 * ============================================================
 *  One installation, many supermarkets. Nothing on screen should
 *  say "QuickMart Ghana" unless the logged-in shop IS QuickMart
 *  Ghana. This file loads the shop's own details once and paints
 *  them onto the page.
 *
 *  Any element with data-shop-name, data-shop-code, data-shop-phone
 *  or data-shop-address gets filled in automatically.
 * ============================================================
 */

const Shop = {

  CACHE_KEY: 'quickmart_shop',
  details: null,

  /**
   * Load the shop's details. Uses the cached copy if we already
   * have one this session, so switching pages is instant.
   */
  async load(force = false) {
    if (!force) {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        this.details = JSON.parse(cached);
        return this.details;
      }
    }

    this.details = await API.shop.receiptSettings();
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.details));
    return this.details;
  },

  get() {
    if (this.details) return this.details;

    const cached = localStorage.getItem(this.CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  },

  /**
   * Currency symbol for this shop. Defaults to the cedi.
   */
  currency() {
    const shop = this.get();
    return (shop && shop.currency_symbol) || 'GH\u20b5';
  },

  /**
   * Format an amount the way this shop wants it.
   */
  money(amount) {
    return this.currency() + ' ' + Number(amount || 0).toFixed(2);
  },

  /**
   * Paint the shop's name, code, phone and address onto the page.
   * Call this after load().
   */
  apply() {
    const shop = this.get();
    if (!shop) return;

    const fullAddress = [shop.address, shop.city, shop.region].filter(Boolean).join(', ');

    const map = {
      'data-shop-name':    shop.name,
      'data-shop-code':    shop.shop_code,
      'data-shop-phone':   shop.phone,
      'data-shop-address': fullAddress,
      'data-shop-slogan':  shop.slogan || ''
    };

    Object.keys(map).forEach(attribute => {
      document.querySelectorAll('[' + attribute + ']').forEach(element => {
        element.textContent = map[attribute] || '';
      });
    });

    // The browser tab title
    document.title = document.title.replace('QuickMart Ghana', shop.name);

    // The logo, wherever one is shown
    if (shop.logo_path) {
      document.querySelectorAll('[data-shop-logo]').forEach(element => {
        if (element.tagName === 'IMG') {
          element.src = shop.logo_path;
          element.style.display = '';
        } else {
          element.innerHTML = `<img src="${shop.logo_path}" alt="${shop.name}" style="max-height:60px">`;
        }
      });
    }
  },

  /**
   * Build the printable receipt HTML from a completed sale.
   *
   * The sale object comes back from POST /api/sales already
   * carrying the shop's branding, so this works for any shop
   * without a single hardcoded name.
   */
  receiptHtml(receipt) {
    const shop = receipt.shop || this.get() || {};
    const currency = shop.currency || shop.currency_symbol || 'GH\u20b5';
    const money = value => currency + ' ' + Number(value || 0).toFixed(2);
    const when = new Date(receipt.date);

    const address = shop.address ||
      [shop.city, shop.region].filter(Boolean).join(', ');

    let items = '';
    receipt.items.forEach(item => {
      items += `
        <tr>
          <td>${item.quantity} x ${item.name}</td>
          <td style="text-align:right">${money(item.subtotal)}</td>
        </tr>`;
    });

    let payment = '';
    if (receipt.paymentMethod === 'cash') {
      payment = `
        <div>Payment: Cash</div>
        <div>Amount Paid: ${money(receipt.amountPaid)}</div>
        <div>Change: ${money(receipt.change)}</div>`;
    } else if (receipt.paymentMethod === 'momo') {
      payment = `
        <div>Payment: Mobile Money</div>
        <div>Provider: ${receipt.momoProvider || '-'}</div>
        <div>Number: ${receipt.momoNumber || '-'}</div>
        <div>Amount: ${money(receipt.amountPaid)}</div>`;
    } else {
      payment = `
        <div>Payment: Card</div>
        <div>Amount: ${money(receipt.amountPaid)}</div>`;
    }

    const taxRow = Number(receipt.taxAmount) > 0
      ? `<div class="receipt-line"><span>${shop.taxLabel || 'Tax'}</span><span>${money(receipt.taxAmount)}</span></div>`
      : '';

    const discountRow = Number(receipt.discount) > 0
      ? `<div class="receipt-line"><span>Discount</span><span>- ${money(receipt.discount)}</span></div>`
      : '';

    return `
      <div class="receipt-header">
        ${shop.logo ? `<img src="${shop.logo}" alt="" style="max-height:56px;margin-bottom:6px">` : ''}
        <div class="store-name">${shop.name || ''}</div>
        ${shop.slogan ? `<div class="store-slogan">${shop.slogan}</div>` : ''}
        <div class="store-address">${address || ''}</div>
        ${shop.digitalAddress ? `<div class="store-address">${shop.digitalAddress}</div>` : ''}
        <div class="store-phone">${shop.phone || ''}</div>
        ${shop.tin ? `<div class="store-phone">TIN: ${shop.tin}</div>` : ''}
      </div>

      <div class="receipt-meta">
        <div>Receipt: ${receipt.receiptNo}</div>
        <div>Date: ${when.toLocaleDateString('en-GB')}</div>
        <div>Time: ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
        <div>Cashier: ${receipt.cashier || receipt.cashierName || ''}</div>
        ${receipt.reprint ? '<div><strong>** REPRINT **</strong></div>' : ''}
      </div>

      <table class="receipt-items">${items}</table>

      <div class="receipt-totals">
        <div class="receipt-line"><span>Subtotal</span><span>${money(receipt.subtotal)}</span></div>
        ${discountRow}
        ${taxRow}
        <div class="receipt-line receipt-total"><span>TOTAL</span><span>${money(receipt.total)}</span></div>
      </div>

      <div class="receipt-payment">${payment}</div>

      <div class="receipt-footer">
        <div>${shop.footer || 'Thank you for shopping with us!'}</div>
        <div class="receipt-code">${shop.shopCode || shop.shop_code || ''}</div>
      </div>
    `;
  }
};
