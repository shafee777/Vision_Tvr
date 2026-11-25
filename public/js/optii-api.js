/**
 * Optii API Client
 * Clean, lightweight abstraction layer connecting the customer storefront
 * directly to the Optii REST API contracts.
 */
const OptiiAPI = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `API error (${res.status})`);
      }
      return data;
    } catch (err) {
      console.error(`[Optii API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // 1. Catalog Products (with full query params for shapes, fit, material, price, gender)
  getProducts(filters = {}) {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(filters)) {
      if (val !== undefined && val !== null && val !== '' && val !== 'all') {
        params.append(key, val);
      }
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/products${query}`);
  },

  // 2. Product Detail Page (PDP)
  getProductBySlug(slug) {
    return this.request(`/products/${slug}`);
  },
  getProduct(slug) {
    return this.getProductBySlug(slug);
  },

  // 3. Optical Frame Shapes with SVG line-art icons
  getShapes() {
    return this.request('/shapes');
  },

  // 4. Optical Brands
  getBrands() {
    return this.request('/brands');
  },

  // 5. Product Categories
  getCategories() {
    return this.request('/categories');
  },

  // 6. Progressive 4-Step Optical Lens Tiers
  getLensOptions() {
    return this.request('/lenses');
  },
  getLenses() {
    return this.getLensOptions();
  },

  // 7. Calculate Dynamic Lens Math
  calculateLensPricing(payload) {
    return this.request('/lenses/calculate', {
      method: 'POST',
      body: payload
    });
  },
  calculateLensPrice(payload) {
    return this.calculateLensPricing(payload);
  },

  // 8. Stores & Available 30-Min Appointment Slots
  getStores() {
    return this.request('/stores');
  },

  getAvailableSlots(storeId, dateStr) {
    return this.request(`/stores/${storeId}/slots?date=${dateStr}`);
  },

  // 9. Book In-Store Eye Test
  bookAppointment(payload) {
    return this.request('/appointments', {
      method: 'POST',
      body: payload
    });
  },

  // 10. WhatsApp Pre-filled Lead Logging
  createWhatsAppEnquiry(payload) {
    return this.request('/enquiries/whatsapp', {
      method: 'POST',
      body: payload
    });
  },

  // 11. Place Optical Order
  placeOrder(payload) {
    return this.request('/orders', {
      method: 'POST',
      body: payload
    });
  },

  // 12. Track Optical Order
  trackOrder(orderNumber) {
    return this.request(`/orders/track/${orderNumber}`);
  },

  // 13. Validate Promotional Privilege Code
  validatePromo(code, subtotal) {
    return this.request('/orders/validate-promo', {
      method: 'POST',
      body: { code, subtotal_inr: subtotal }
    });
  }
};

window.OptiiAPI = OptiiAPI;
