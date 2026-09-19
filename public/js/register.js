/**
 * ============================================================
 *  js/register.js - the shop sign-up wizard
 * ============================================================
 *  Three short steps instead of one long form, because a shop
 *  owner filling this in on a phone will abandon a page with
 *  fourteen boxes on it.
 * ============================================================
 */

let currentStep = 1;
let selectedPlan = 'starter';

const errorBox = document.getElementById('errorMessage');


// ── Load the plans so the prices are never out of date ──
document.addEventListener('DOMContentLoaded', async function () {

  // Already logged in? No need to register again.
  if (Auth.isLoggedIn()) {
    window.location.href = Auth.homePageFor(Auth.getCurrentUser().role);
    return;
  }

  try {
    const plans = await API.subscription.plans();
    renderPlans(plans);
  } catch (error) {
    document.getElementById('planOptions').innerHTML =
      '<p class="text-danger">Could not load plans. Is the server running?</p>';
  }
});

function renderPlans(plans) {
  const container = document.getElementById('planOptions');
  let html = '';

  plans.forEach(function (plan, index) {
    const active = index === 0 ? ' selected' : '';
    if (index === 0) selectedPlan = plan.code;

    html += `
      <label class="plan-option${active}" data-plan="${plan.code}">
        <div class="plan-head">
          <span class="plan-name">${plan.name}</span>
          <span class="plan-price">GH&#8373; ${Number(plan.price_monthly).toFixed(0)}<small>/month</small></span>
        </div>
        <div class="plan-meta">
          ${plan.max_products > 0 ? plan.max_products + ' products' : 'Unlimited products'}
          &middot;
          ${plan.max_users > 0 ? plan.max_users + ' staff' : 'Unlimited staff'}
        </div>
        <div class="plan-trial">${plan.trial_days} days free</div>
      </label>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.plan-option').forEach(function (option) {
    option.addEventListener('click', function () {
      container.querySelectorAll('.plan-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedPlan = option.getAttribute('data-plan');
    });
  });
}


/**
 * Move between steps, checking the current one first.
 */
function goToStep(step) {
  if (step > currentStep && !validateStep(currentStep)) {
    return;
  }

  hideError();
  currentStep = step;

  document.querySelectorAll('.form-step').forEach(function (section) {
    section.classList.remove('active');
  });
  document.getElementById('step-' + step).classList.add('active');

  document.querySelectorAll('.steps-bar .step').forEach(function (indicator) {
    const number = Number(indicator.getAttribute('data-step'));
    indicator.classList.toggle('active', number === step);
    indicator.classList.toggle('done', number < step);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
  if (step === 1) {
    if (!value('shopName')) {
      return showError('Please enter your shop name.');
    }
  }

  if (step === 2) {
    if (!value('phone')) {
      return showError('Please enter a phone number for the shop.');
    }
  }

  return true;
}


// ── Submit ──
document.getElementById('registerForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  hideError();

  if (!value('ownerName'))  return showError('Please enter your full name.');
  if (!value('email'))      return showError('Please enter your email address.');
  if (value('password').length < 6) {
    return showError('Password must be at least 6 characters.');
  }
  if (value('password') !== value('confirmPassword')) {
    return showError('The two passwords do not match.');
  }

  const button = document.getElementById('submitBtn');
  button.disabled = true;
  button.textContent = 'Creating your shop...';

  try {
    const result = await Auth.register({
      shopName:       value('shopName'),
      businessType:   value('businessType'),
      ownerName:      value('ownerName'),
      email:          value('email'),
      username:       value('username'),
      phone:          value('phone'),
      password:       value('password'),
      address:        value('address'),
      city:           value('city'),
      region:         value('region'),
      digitalAddress: value('digitalAddress'),
      tin:            value('tin'),
      planCode:       selectedPlan
    });

    // Show the shop code - they need it, and it feels like an achievement
    document.getElementById('successTitle').textContent = 'Welcome, ' + result.shop.name + '!';
    document.getElementById('successMessage').textContent = result.message;
    document.getElementById('successShopCode').textContent = result.shop.shopCode;
    document.getElementById('successOverlay').classList.add('show');

  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = 'Create My Shop';
  }
});


// ── Small helpers ──

function value(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : '';
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return false;
}

function hideError() {
  errorBox.classList.remove('show');
}

document.getElementById('togglePassword').addEventListener('click', function () {
  const field = document.getElementById('password');
  const showing = field.type === 'text';
  field.type = showing ? 'password' : 'text';
  this.textContent = showing ? 'Show' : 'Hide';
});
