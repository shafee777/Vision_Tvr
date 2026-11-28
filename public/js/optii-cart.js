/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — UNIFIED SHOPPING BAG, CHECKOUT & TRACKING CONTROLLER
 * European Optical Retail Standards (Ace & Tate Reference)
 * ═════════════════════════════════════════════════════════════════════
 */

const OptiiCart = {
  state: {
    cart: JSON.parse(localStorage.getItem('optii_cart') || '[]'),
    wishlist: JSON.parse(localStorage.getItem('optii_wishlist') || '[]'),
    appliedPromo: JSON.parse(sessionStorage.getItem('optii_promo') || 'null'),
    checkout: {
      step: 1,
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      shipping_address: '',
      city: '',
      state: 'Tamil Nadu',
      pincode: '',
      delivery_method: 'express', // 'express' | 'pickup'
      payment_method: 'online',   // 'online' | 'cod' | 'in_store'
      lastOrder: null
    }
  },

  // 1. Initialization
  init() {
    console.log('[Optii Cart] Initializing unified shopping bag and checkout controller...');
    this.updateBadges();
    this.bindEvents();
  },

  // 2. Global Event Binding
  bindEvents() {
    // Header Bag Triggers
    const cartBtns = document.querySelectorAll('#header-cart-btn, [data-open-cart]');
    cartBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggle(true);
      });
    });

    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => this.toggle(false));

    const closeBtn = document.getElementById('cart-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.toggle(false));

    // Global Keydown Escape listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.toggle(false);
        this.closeCheckout();
        this.closeTrackModal();
      }
    });
  },

  // 3. Toggle Cart Drawer
  toggle(open) {
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
      if (open) this.render();
    }
  },

  // 4. Update Header Badges
  updateBadges() {
    const totalQty = this.state.cart.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
    const cartBadges = document.querySelectorAll('#cart-badge, .cart-badge-count');
    cartBadges.forEach(b => {
      b.textContent = totalQty;
      b.style.display = totalQty > 0 ? 'flex' : 'none';
    });

    const wishBadges = document.querySelectorAll('#wishlist-badge, .wishlist-badge-count');
    wishBadges.forEach(b => {
      b.textContent = this.state.wishlist.length;
      b.style.display = this.state.wishlist.length > 0 ? 'flex' : 'none';
    });
  },

  // 5. Add Item to Bag
  addItem(item) {
    // Check if identical item (same variant and configured lens specs) already exists
    const existingIndex = this.state.cart.findIndex(i => 
      i.variant_id === item.variant_id && 
      JSON.stringify(i.configured_lenses) === JSON.stringify(item.configured_lenses)
    );

    if (existingIndex > -1) {
      this.state.cart[existingIndex].quantity = (Number(this.state.cart[existingIndex].quantity) || 1) + (Number(item.quantity) || 1);
    } else {
      item.quantity = Number(item.quantity) || 1;
      this.state.cart.push(item);
    }

    this.save();
    this.toggle(true);
  },

  // 6. Update Item Quantity with Inventory Bounds
  updateQty(index, delta) {
    const item = this.state.cart[index];
    if (!item) return;

    const currentQty = Number(item.quantity) || 1;
    const newQty = currentQty + delta;

    if (newQty < 1) {
      this.removeItem(index);
      return;
    }

    // Check variant stock if known
    if (item.stock_quantity && newQty > item.stock_quantity) {
      alert(`Only ${item.stock_quantity} units available for ${item.product_name} (${item.color_name}).`);
      return;
    }

    item.quantity = newQty;
    this.save();
  },

  // 7. Remove Item
  removeItem(index) {
    this.state.cart.splice(index, 1);
    this.save();
  },

  // 8. Persist Cart & Re-render
  save() {
    localStorage.setItem('optii_cart', JSON.stringify(this.state.cart));
    this.updateBadges();
    this.render();
  },

  // 9. Calculate Totals
  calculateTotals() {
    let subtotal = 0;
    this.state.cart.forEach(item => {
      const price = Number(item.total_price_inr || item.price_inr || item.item_price_inr || 0);
      const qty = Number(item.quantity) || 1;
      subtotal += (price * qty);
    });

    let discount = 0;
    if (this.state.appliedPromo) {
      const promo = this.state.appliedPromo;
      if (promo.discount_type === 'percentage') {
        discount = Math.round(subtotal * (promo.discount_value / 100));
        if (promo.max_discount_inr && discount > promo.max_discount_inr) {
          discount = promo.max_discount_inr;
        }
      } else {
        discount = Number(promo.discount_value || 0);
      }
      discount = Math.min(discount, subtotal);
    }

    const shipping = 0; // Complimentary Insured Express Courier
    const total = Math.max(0, subtotal - discount + shipping);

    return { subtotal, discount, shipping, total };
  },

  // 10. Render Slide-Out Cart Drawer
  render() {
    const container = document.getElementById('cart-drawer-items');
    const footer = document.querySelector('#cart-drawer .drawer-footer');
    if (!container) return;

    if (this.state.cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 4rem 1.5rem; color: var(--color-ink-muted);">
          <div style="font-size: 32px; margin-bottom: 12px;">🕶️</div>
          <h4 style="font-size: 16px; font-weight: 500; color: var(--color-ink); margin-bottom: 6px;">Your Optical Bag is empty</h4>
          <p style="font-size: 13px; line-height: 1.5; margin-bottom: 1.5rem;">Explore our curated silhouettes and configure high-precision prescription lenses.</p>
          <a href="/#curated-frames" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; text-decoration: none; display: inline-block; padding: 8px 24px; font-size: 13px;" onclick="OptiiCart.toggle(false)">Browse Frames</a>
        </div>
      `;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'block';

    const { subtotal, discount, total } = this.calculateTotals();

    // Render Items
    container.innerHTML = `
      <div class="cart-drawer-list">
        ${this.state.cart.map((item, idx) => {
          const qty = Number(item.quantity) || 1;
          const itemPrice = Number(item.total_price_inr || item.price_inr || item.item_price_inr || 0);
          const lineTotal = itemPrice * qty;
          const lenses = item.configured_lenses || {};
          const hasPrescription = !!(item.prescription_token || item.prescription_file_url || lenses.prescription_token);
          const rawImg = item.image_url || 'images/tortoise_round_front.jpg';
          const imgSrc = rawImg.startsWith('/') || rawImg.startsWith('http') ? rawImg : `/${rawImg}`;

          return `
            <div class="cart-item-card">
              <img class="cart-item-img" src="${imgSrc}" alt="${item.product_name}" />
              <div class="cart-item-info">
                <div class="cart-item-title">${item.product_name}</div>
                <div class="cart-item-meta">${item.color_name || 'Standard'}${item.dimensions ? ` · ${item.dimensions}` : ''}</div>
                
                ${lenses.usage_name ? `
                  <div class="cart-item-lens-pill">
                    ${lenses.usage_name} · ${lenses.thickness_name || 'Standard'}
                    ${hasPrescription ? `<span class="cart-item-rx-badge">Rx Attached</span>` : `<span class="cart-item-rx-badge later">Rx Later</span>`}
                  </div>
                ` : ''}

                <div class="cart-item-bottom">
                  <div class="cart-stepper">
                    <button type="button" class="cart-stepper-btn" onclick="OptiiCart.updateQty(${idx}, -1)" aria-label="Decrease quantity">−</button>
                    <span class="cart-stepper-val">${qty}</span>
                    <button type="button" class="cart-stepper-btn" onclick="OptiiCart.updateQty(${idx}, 1)" aria-label="Increase quantity">+</button>
                  </div>
                  <div>
                    <span class="cart-item-price">₹${lineTotal.toLocaleString('en-IN')}</span>
                    <button type="button" class="cart-item-remove-btn" onclick="OptiiCart.removeItem(${idx})">Remove</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Render Footer with Promo Box, Pricing Breakdown and Action CTAs
    if (footer) {
      footer.innerHTML = `
        <!-- Promo Code Box -->
        <div class="cart-promo-section">
          ${this.state.appliedPromo ? `
            <div class="cart-promo-applied">
              <span>✓ Privilege <strong>${this.state.appliedPromo.code}</strong> Applied (-₹${discount.toLocaleString('en-IN')})</span>
              <button type="button" class="cart-promo-applied-remove" onclick="OptiiCart.removePromo()" title="Remove Code">×</button>
            </div>
          ` : `
            <form class="cart-promo-form" onsubmit="OptiiCart.handlePromoSubmit(event)">
              <input type="text" id="cart-promo-input" class="cart-promo-input" placeholder="Privilege Code (e.g. WELCOME500)" autocomplete="off" />
              <button type="submit" class="cart-promo-btn">Apply</button>
            </form>
          `}
        </div>

        <!-- Price Breakdown -->
        <div style="padding: 12px 0; border-bottom: 1px solid var(--color-border); font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; color: var(--color-ink-secondary);">
            <span>Bag Subtotal</span>
            <span>₹${subtotal.toLocaleString('en-IN')}</span>
          </div>

          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #166534; font-weight: 500;">
              <span>Privilege Discount</span>
              <span>-₹${discount.toLocaleString('en-IN')}</span>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: space-between; color: var(--color-ink-secondary);">
            <span>Insured Express Courier</span>
            <span style="color: #166534; font-weight: 500;">COMPLIMENTARY</span>
          </div>

          <div style="display: flex; justify-content: space-between; color: var(--color-ink-muted); font-size: 12px;">
            <span>GST (18% Optical Goods)</span>
            <span>Included</span>
          </div>
        </div>

        <!-- Grand Total -->
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; padding: 12px 0 8px;">
          <span>Estimated Total</span>
          <span>₹${total.toLocaleString('en-IN')}</span>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
          <button type="button" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; width: 100%; height: 46px; font-size: 14px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.openCheckout()">
            Proceed to Checkout · ₹${total.toLocaleString('en-IN')}
          </button>

          <button type="button" class="btn-pill-secondary" style="width: 100%; height: 40px; font-size: 12px; font-weight: 600; border: 1px solid var(--color-border); background: #fff; color: var(--color-ink); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="OptiiCart.orderViaWhatsApp()">
            Order Entire Bag via WhatsApp
          </button>
        </div>
      `;
    }
  },

  // 11. Promo Code Handling
  async handlePromoSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('cart-promo-input');
    if (!input || !input.value.trim()) return;

    const code = input.value.trim().toUpperCase();
    const { subtotal } = this.calculateTotals();

    try {
      const res = await OptiiAPI.validatePromo(code, subtotal);
      if (res && res.valid) {
        this.state.appliedPromo = {
          code: res.code,
          discount_type: res.discount_type,
          discount_value: res.discount_value,
          discount_inr: res.discount_inr,
          description: res.description
        };
        sessionStorage.setItem('optii_promo', JSON.stringify(this.state.appliedPromo));
        this.render();
      }
    } catch (err) {
      alert(err.message || 'Invalid promotional privilege code.');
    }
  },

  removePromo() {
    this.state.appliedPromo = null;
    sessionStorage.removeItem('optii_promo');
    this.render();
  },

  // 12. Order via WhatsApp (Entire Bag)
  async orderViaWhatsApp() {
    if (this.state.cart.length === 0) return;
    const { total } = this.calculateTotals();

    try {
      const res = await OptiiAPI.createWhatsAppEnquiry({
        items: this.state.cart,
        total_price_inr: total,
        customer_name: this.state.checkout.customer_name || 'Atelier Patron'
      });

      if (res && res.whatsapp_url) {
        window.open(res.whatsapp_url, '_blank');
      }
    } catch (err) {
      console.error('WhatsApp Error:', err);
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // CHECKOUT MODAL & ORDER CREATION ENGINE
  // ═════════════════════════════════════════════════════════════════════

  openCheckout() {
    if (this.state.cart.length === 0) {
      alert('Your optical shopping bag is empty.');
      return;
    }

    this.toggle(false); // Close cart drawer
    let modal = document.getElementById('checkout-modal');
    if (!modal) {
      this.injectCheckoutModal();
      modal = document.getElementById('checkout-modal');
    }

    this.state.checkout.step = 1;
    this.renderCheckoutStep();
    modal.classList.add('active');
  },

  closeCheckout() {
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.remove('active');
  },

  injectCheckoutModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'checkout-modal';
    backdrop.className = 'checkout-modal-backdrop';
    backdrop.innerHTML = `
      <div class="checkout-modal-card">
        <div class="checkout-modal-header">
          <span class="checkout-modal-title">Vision Opticals Checkout</span>
          <button class="drawer-close-btn" onclick="OptiiCart.closeCheckout()" aria-label="Close Checkout">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="checkout-stepper-bar" id="checkout-stepper-bar">
          <div class="checkout-step-pill active" id="chk-pill-1">1. Delivery</div>
          <div class="checkout-step-pill" id="chk-pill-2">2. Shipping</div>
          <div class="checkout-step-pill" id="chk-pill-3">3. Payment</div>
          <div class="checkout-step-pill" id="chk-pill-4">4. Review</div>
        </div>
        <div class="checkout-modal-body" id="checkout-modal-body">
          <!-- Step Form injected dynamically -->
        </div>
        <div class="checkout-modal-footer" id="checkout-modal-footer">
          <!-- Step Navigation Buttons -->
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  },

  setCheckoutStep(step) {
    // Validate current step before advancing
    if (step > this.state.checkout.step) {
      if (this.state.checkout.step === 1 && !this.validateStep1()) return;
    }

    this.state.checkout.step = step;
    this.renderCheckoutStep();
  },

  validateStep1() {
    const name = (document.getElementById('chk-name')?.value || '').trim();
    const phone = (document.getElementById('chk-phone')?.value || '').trim().replace(/[^0-9]/g, '');
    const email = (document.getElementById('chk-email')?.value || '').trim();
    const addr = (document.getElementById('chk-address')?.value || '').trim();
    const city = (document.getElementById('chk-city')?.value || '').trim();
    const state = (document.getElementById('chk-state')?.value || '').trim();
    const pin = (document.getElementById('chk-pincode')?.value || '').trim();

    if (!name) {
      alert('Please enter your full customer name.');
      return false;
    }
    if (phone.length !== 10) {
      alert('Please enter a valid 10-digit Indian mobile number for courier & WhatsApp dispatch tracking.');
      return false;
    }
    if (!addr) {
      alert('Please enter your complete street shipping address.');
      return false;
    }
    if (!city) {
      alert('Please specify your city.');
      return false;
    }
    if (pin.length !== 6) {
      alert('Please specify a valid 6-digit postal PIN code.');
      return false;
    }

    // Save to state
    this.state.checkout.customer_name = name;
    this.state.checkout.customer_phone = phone;
    this.state.checkout.customer_email = email;
    this.state.checkout.shipping_address = addr;
    this.state.checkout.city = city;
    this.state.checkout.state = state;
    this.state.checkout.pincode = pin;

    return true;
  },

  renderCheckoutStep() {
    const body = document.getElementById('checkout-modal-body');
    const footer = document.getElementById('checkout-modal-footer');
    const step = this.state.checkout.step;

    // Update Stepper Bar Active State
    [1, 2, 3, 4].forEach(n => {
      const pill = document.getElementById(`chk-pill-${n}`);
      if (pill) {
        pill.classList.toggle('active', n === step);
        pill.classList.toggle('completed', n < step);
      }
    });

    const { subtotal, discount, total } = this.calculateTotals();

    // ── STEP 1: CONTACT & DELIVERY ADDRESS ──
    if (step === 1) {
      body.innerHTML = `
        <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 1rem;">Customer & Shipping Address</h4>
        
        <div class="checkout-field-grid">
          <div class="checkout-form-group">
            <label class="checkout-form-label">Full Name *</label>
            <input type="text" id="chk-name" class="checkout-form-input" placeholder="e.g. Shafeeq Ahmed" value="${this.state.checkout.customer_name}" required />
          </div>
          <div class="checkout-form-group">
            <label class="checkout-form-label">Mobile Number (10 digits) *</label>
            <input type="tel" id="chk-phone" class="checkout-form-input" placeholder="e.g. 9876543210" maxlength="10" value="${this.state.checkout.customer_phone}" required />
          </div>
        </div>

        <div class="checkout-field-grid single">
          <div class="checkout-form-group">
            <label class="checkout-form-label">Email Address (For Tax Receipt & Glazing Tracking)</label>
            <input type="email" id="chk-email" class="checkout-form-input" placeholder="patron@example.com" value="${this.state.checkout.customer_email}" />
          </div>
        </div>

        <div class="checkout-field-grid single">
          <div class="checkout-form-group">
            <label class="checkout-form-label">Street Address & Apartment / Landmark *</label>
            <input type="text" id="chk-address" class="checkout-form-input" placeholder="House/Flat No., Road, Area, Landmark" value="${this.state.checkout.shipping_address}" required />
          </div>
        </div>

        <div class="checkout-field-grid">
          <div class="checkout-form-group">
            <label class="checkout-form-label">City *</label>
            <input type="text" id="chk-city" class="checkout-form-input" placeholder="e.g. Thiruvarur / Chennai" value="${this.state.checkout.city}" required />
          </div>
          <div class="checkout-form-group">
            <label class="checkout-form-label">State *</label>
            <select id="chk-state" class="checkout-form-select">
              ${['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Delhi', 'Kerala', 'Telangana', 'Andhra Pradesh', 'West Bengal', 'Gujarat', 'Rajasthan', 'Other India State'].map(st => `
                <option value="${st}" ${this.state.checkout.state === st ? 'selected' : ''}>${st}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="checkout-field-grid">
          <div class="checkout-form-group">
            <label class="checkout-form-label">Postal PIN Code (6 digits) *</label>
            <input type="text" id="chk-pincode" class="checkout-form-input" placeholder="610001" maxlength="6" value="${this.state.checkout.pincode}" required />
          </div>
        </div>
      `;

      footer.innerHTML = `
        <button type="button" class="btn-pill-secondary" style="border: none; background: none; color: var(--color-ink-muted); cursor: pointer;" onclick="OptiiCart.closeCheckout()">Cancel</button>
        <button type="button" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.setCheckoutStep(2)">
          Continue to Shipping Method →
        </button>
      `;
    }

    // ── STEP 2: SHIPPING / COLLECTION METHOD ──
    else if (step === 2) {
      body.innerHTML = `
        <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 1rem;">Select Shipping or Store Collection</h4>

        <label class="checkout-choice-card ${this.state.checkout.delivery_method === 'express' ? 'selected' : ''}">
          <input type="radio" name="del_method" value="express" ${this.state.checkout.delivery_method === 'express' ? 'checked' : ''} onchange="OptiiCart.setDeliveryMethod('express')" />
          <div class="checkout-choice-info">
            <div class="checkout-choice-title">Complimentary Express Courier (Insured)</div>
            <div class="checkout-choice-desc">Delivered to your doorstep across India in 3–5 business days post computerized lens glazing. Includes protective hard case and microfiber cloth.</div>
          </div>
          <div class="checkout-choice-price" style="color: #166534;">FREE</div>
        </label>

        <label class="checkout-choice-card ${this.state.checkout.delivery_method === 'pickup' ? 'selected' : ''}">
          <input type="radio" name="del_method" value="pickup" ${this.state.checkout.delivery_method === 'pickup' ? 'checked' : ''} onchange="OptiiCart.setDeliveryMethod('pickup')" />
          <div class="checkout-choice-info">
            <div class="checkout-choice-title">Store Pickup & Custom Fitting</div>
            <div class="checkout-choice-desc">${(window.__OPTII_STORE_SETTINGS__?.store?.name || 'Vision Opticals')} (${(window.__OPTII_STORE_SETTINGS__?.store?.address || '12 Kamalalayam West Bank, Thiruvarur')}). Includes complimentary in-person ergonomic temple adjustment.</div>
          </div>
          <div class="checkout-choice-price" style="color: #166534;">FREE</div>
        </label>
      `;

      footer.innerHTML = `
        <button type="button" class="btn-pill-secondary" style="border: none; background: none; color: var(--color-ink-muted); cursor: pointer;" onclick="OptiiCart.setCheckoutStep(1)">← Back to Details</button>
        <button type="button" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.setCheckoutStep(3)">
          Continue to Payment →
        </button>
      `;
    }

    // ── STEP 3: PAYMENT METHOD ──
    else if (step === 3) {
      body.innerHTML = `
        <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 1rem;">Payment Method</h4>

        <label class="checkout-choice-card ${this.state.checkout.payment_method === 'online' ? 'selected' : ''}">
          <input type="radio" name="pay_method" value="online" ${this.state.checkout.payment_method === 'online' ? 'checked' : ''} onchange="OptiiCart.setPaymentMethod('online')" />
          <div class="checkout-choice-info">
            <div class="checkout-choice-title">Instant Online Payment (UPI / Cards / NetBanking)</div>
            <div class="checkout-choice-desc">Instant verified confirmation. Supports GPay, PhonePe, Paytm, RuPay, Visa, Mastercard, and Net Banking.</div>
          </div>
        </label>

        <label class="checkout-choice-card ${this.state.checkout.payment_method === 'cod' ? 'selected' : ''}">
          <input type="radio" name="pay_method" value="cod" ${this.state.checkout.payment_method === 'cod' ? 'checked' : ''} onchange="OptiiCart.setPaymentMethod('cod')" />
          <div class="checkout-choice-info">
            <div class="checkout-choice-title">Cash on Delivery (COD)</div>
            <div class="checkout-choice-desc">Pay cash or scan courier UPI QR upon package inspection at your delivery address.</div>
          </div>
        </label>

        ${this.state.checkout.delivery_method === 'pickup' ? `
          <label class="checkout-choice-card ${this.state.checkout.payment_method === 'in_store' ? 'selected' : ''}">
            <input type="radio" name="pay_method" value="in_store" ${this.state.checkout.payment_method === 'in_store' ? 'checked' : ''} onchange="OptiiCart.setPaymentMethod('in_store')" />
            <div class="checkout-choice-info">
              <div class="checkout-choice-title">Pay at Store</div>
              <div class="checkout-choice-desc">Settle balance via card or cash when picking up your finished eyewear at Vision Opticals.</div>
            </div>
          </label>
        ` : ''}
      `;

      footer.innerHTML = `
        <button type="button" class="btn-pill-secondary" style="border: none; background: none; color: var(--color-ink-muted); cursor: pointer;" onclick="OptiiCart.setCheckoutStep(2)">← Back to Shipping</button>
        <button type="button" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.setCheckoutStep(4)">
          Review Order Summary →
        </button>
      `;
    }

    // ── STEP 4: ORDER REVIEW & PLACE ORDER ──
    else if (step === 4) {
      body.innerHTML = `
        <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 1rem;">Review & Confirm Your Optical Order</h4>

        <div style="background: var(--color-surface-subtle); padding: 12px; border-radius: 4px; margin-bottom: 1rem; font-size: 13px;">
          <div style="font-weight: 600; margin-bottom: 4px;">Delivering to:</div>
          <div>${this.state.checkout.customer_name} · +91 ${this.state.checkout.customer_phone}</div>
          <div style="color: var(--color-ink-secondary); margin-top: 2px;">${this.state.checkout.shipping_address}, ${this.state.checkout.city}, ${this.state.checkout.state} — ${this.state.checkout.pincode}</div>
          <div style="margin-top: 6px; font-size: 12px;"><strong>Method:</strong> ${this.state.checkout.delivery_method === 'pickup' ? 'Store Pickup (Thiruvarur)' : 'Express Insured Courier'} · <strong>Payment:</strong> ${this.state.checkout.payment_method.toUpperCase()}</div>
        </div>

        <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px;">Order Items (${this.state.cart.length}):</div>
        <div style="max-height: 180px; overflow-y: auto; border: 1px solid var(--color-border); padding: 8px; margin-bottom: 1rem;">
          ${this.state.cart.map(it => `
            <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; border-bottom: 1px dashed var(--color-border);">
              <div>
                <strong>${it.product_name}</strong> (${it.color_name || 'Standard'}) × ${it.quantity || 1}
                <div style="color: var(--color-ink-muted); font-size: 11px;">
                  ${it.configured_lenses ? `${it.configured_lenses.usage_name} · ${it.configured_lenses.thickness_name}` : 'Frame Only'}
                </div>
              </div>
              <div style="font-weight: 600;">₹${(Number(it.total_price_inr || it.price_inr || it.item_price_inr || 0) * (it.quantity || 1)).toLocaleString('en-IN')}</div>
            </div>
          `).join('')}
        </div>

        <div style="background: #fff; border: 1px solid var(--color-border); padding: 12px; font-size: 13px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
          ${discount > 0 ? `<div style="display: flex; justify-content: space-between; color: #166534;"><span>Privilege Discount (${this.state.appliedPromo.code}):</span><span>-₹${discount.toLocaleString('en-IN')}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between;"><span>Shipping:</span><span style="color: #166534; font-weight: 600;">FREE</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; border-top: 1px solid var(--color-border); padding-top: 6px; margin-top: 4px;">
            <span>Total Payable:</span>
            <span>₹${total.toLocaleString('en-IN')}</span>
          </div>
        </div>
      `;

      footer.innerHTML = `
        <button type="button" class="btn-pill-secondary" style="border: none; background: none; color: var(--color-ink-muted); cursor: pointer;" onclick="OptiiCart.setCheckoutStep(3)">← Back</button>
        <button type="button" id="btn-submit-order" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; padding: 12px 28px; font-size: 14px; font-weight: 700; cursor: pointer;" onclick="OptiiCart.submitOrder()">
          Place Order · ₹${total.toLocaleString('en-IN')}
        </button>
      `;
    }

    // ── STEP 5: ORDER SUCCESS STATE ──
    else if (step === 5) {
      const order = this.state.checkout.lastOrder;
      const stepper = document.getElementById('checkout-stepper-bar');
      if (stepper) stepper.style.display = 'none';

      body.innerHTML = `
        <div class="checkout-success-view">
          <div class="checkout-success-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 6px;">Thank You, ${order.customer_name}!</h3>
          <p style="font-size: 13px; color: var(--color-ink-secondary); margin-bottom: 12px;">Your optical order has been confirmed and forwarded to our master glazers.</p>
          
          <div class="checkout-success-order-num">Order Reference: ${order.order_number}</div>

          <div style="background: var(--color-surface-subtle); padding: 14px; border-radius: 4px; text-align: left; font-size: 12px; margin-bottom: 1.5rem;">
            <div><strong>Amount:</strong> ₹${Number(order.total_amount_inr).toLocaleString('en-IN')} (${order.payment_method.toUpperCase()})</div>
            <div style="margin-top: 4px;"><strong>Estimated Dispatch:</strong> ${order.estimated_delivery}</div>
            <div style="margin-top: 4px;"><strong>Tracking Consignment:</strong> ${order.tracking_number}</div>
            <div style="margin-top: 4px;"><strong>Shipping Address:</strong> ${order.shipping_address}, ${order.city} — ${order.pincode}</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${order.whatsapp_url ? `
              <a href="${order.whatsapp_url}" target="_blank" class="btn-pill-primary" style="background: #25D366; color: #fff; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; font-size: 13px; font-weight: 600;">
                Confirm Order on WhatsApp & Submit Rx
              </a>
            ` : ''}

            <button type="button" class="btn-pill-secondary" style="border: 1px solid var(--color-border); background: #fff; color: var(--color-ink); height: 40px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.openTrackModal('${order.order_number}')">
              Track Order Real-Time
            </button>
          </div>
        </div>
      `;

      footer.innerHTML = `
        <button type="button" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; width: 100%; height: 42px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiCart.closeCheckout()">
          Continue Browsing Collections
        </button>
      `;
    }
  },

  setDeliveryMethod(method) {
    this.state.checkout.delivery_method = method;
    this.renderCheckoutStep();
  },

  setPaymentMethod(method) {
    this.state.checkout.payment_method = method;
    this.renderCheckoutStep();
  },

  // 13. Submit Order API Call
  async submitOrder() {
    const btn = document.getElementById('btn-submit-order');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Confirming Order…';
    }

    const { subtotal, discount } = this.calculateTotals();

    const payload = {
      customer_name: this.state.checkout.customer_name,
      customer_phone: this.state.checkout.customer_phone,
      customer_email: this.state.checkout.customer_email,
      shipping_address: this.state.checkout.shipping_address,
      city: this.state.checkout.city,
      state: this.state.checkout.state,
      pincode: this.state.checkout.pincode,
      delivery_method: this.state.checkout.delivery_method,
      payment_method: this.state.checkout.payment_method,
      promo_code: this.state.appliedPromo ? this.state.appliedPromo.code : null,
      subtotal_inr: subtotal,
      discount_inr: discount,
      items: this.state.cart
    };

    try {
      const res = await OptiiAPI.placeOrder(payload);
      if (res && res.success && res.order) {
        this.state.checkout.lastOrder = res.order;
        // Clear Bag on successful placement
        this.state.cart = [];
        this.state.appliedPromo = null;
        localStorage.removeItem('optii_cart');
        sessionStorage.removeItem('optii_promo');
        this.updateBadges();

        // Advance to Success View
        this.state.checkout.step = 5;
        this.renderCheckoutStep();
      } else {
        throw new Error(res.message || 'Unable to place order.');
      }
    } catch (err) {
      console.error('Submit Order Error:', err);
      alert(err.message || 'Failed to place optical order. Please verify your details and try again.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Retry Place Order';
      }
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // PUBLIC REAL-TIME ORDER TRACKING SYSTEM
  // ═════════════════════════════════════════════════════════════════════

  openTrackModal(orderNumber) {
    this.closeCheckout();

    let modal = document.getElementById('track-modal');
    if (!modal) {
      this.injectTrackModal();
      modal = document.getElementById('track-modal');
    }

    modal.classList.add('active');

    if (orderNumber) {
      const input = document.getElementById('track-search-input');
      if (input) input.value = orderNumber;
      this.fetchOrderTracking(orderNumber);
    }
  },

  closeTrackModal() {
    const modal = document.getElementById('track-modal');
    if (modal) modal.classList.remove('active');
  },

  injectTrackModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'track-modal';
    backdrop.className = 'checkout-modal-backdrop';
    backdrop.innerHTML = `
      <div class="checkout-modal-card order-track-modal-card">
        <div class="checkout-modal-header">
          <span class="checkout-modal-title">Optical Order Tracking</span>
          <button class="drawer-close-btn" onclick="OptiiCart.closeTrackModal()" aria-label="Close Tracking">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="checkout-modal-body" style="padding: 1.5rem;">
          <form onsubmit="OptiiCart.handleTrackSubmit(event)" style="display: flex; gap: 8px; margin-bottom: 1.5rem;">
            <input type="text" id="track-search-input" class="checkout-form-input" style="flex: 1;" placeholder="Enter Order Number (e.g. OPT-ORD-2026-XXXX)" required />
            <button type="submit" class="btn-pill-primary" style="background: var(--color-ink); color: #fff; padding: 0 20px; font-size: 13px; font-weight: 600; cursor: pointer;">Track</button>
          </form>

          <div id="track-results-container">
            <div style="text-align: center; color: var(--color-ink-muted); padding: 2rem 0; font-size: 13px;">
              Enter your Optii order reference code to check real-time prescription verification, robotic glazing, and courier transit.
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  },

  handleTrackSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('track-search-input');
    if (input && input.value.trim()) {
      this.fetchOrderTracking(input.value.trim());
    }
  },

  async fetchOrderTracking(orderNumber) {
    const container = document.getElementById('track-results-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--color-ink-muted);">Retrieving order status…</div>';

    try {
      const res = await OptiiAPI.trackOrder(orderNumber);
      if (!res || !res.success || !res.order) {
        container.innerHTML = '<div style="text-align: center; color: #dc2626; padding: 2rem 0;">Order reference number not found. Please verify and try again.</div>';
        return;
      }

      const o = res.order;
      const stages = o.stages || [];

      container.innerHTML = `
        <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 12px; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 16px;">${o.order_number}</span>
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; background: var(--color-ink); color: #fff; padding: 2px 8px; border-radius: 9999px;">
              ${o.order_status.replace('_', ' ')}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--color-ink-secondary); margin-top: 4px;">
            Patron: <strong>${o.customer_name}</strong> · Total: <strong>₹${Number(o.total_amount_inr).toLocaleString('en-IN')}</strong> (${o.payment_method.toUpperCase()})
          </div>
          <div style="font-size: 11px; color: var(--color-ink-muted); margin-top: 2px;">
            Courier Tracking: <strong>${o.tracking_number || 'BlueDart Express'}</strong> · Estimated Delivery: <strong>${o.estimated_delivery}</strong>
          </div>
        </div>

        <div class="track-timeline">
          ${stages.map((st, i) => {
            const isCompleted = st.completed;
            const isCurrent = o.order_status === st.key;
            return `
              <div class="track-stage ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}">
                <div class="track-stage-line"></div>
                <div class="track-stage-bullet">${isCompleted ? '✓' : (i + 1)}</div>
                <div class="track-stage-info">
                  <div class="track-stage-title">${st.label}</div>
                  <div class="track-stage-desc">${st.description}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 1.5rem; background: var(--color-surface-subtle); padding: 12px; border-radius: 4px;">
          <div style="font-size: 12px; font-weight: 600; margin-bottom: 6px;">Configured Eyewear:</div>
          ${(o.items || []).map(it => `
            <div style="font-size: 12px; margin-bottom: 4px;">
              • <strong>${it.product_name}</strong> (${it.color_name || 'Standard'}) × ${it.quantity || 1}
              <span style="color: var(--color-ink-muted);">— ${it.configured_lenses ? it.configured_lenses.usage_name : 'Frame Only'}</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="text-align: center; color: #dc2626; padding: 2rem 0;">${err.message || 'Error tracking order.'}</div>`;
    }
  }
};

window.OptiiCart = OptiiCart;
document.addEventListener('DOMContentLoaded', () => OptiiCart.init());
