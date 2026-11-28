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

  // 8b. Unified Store Identity, Logo, Contact & Operating Hours
  getSettings() {
    return this.request('/settings');
  },

  async hydrateStorefrontBranding() {
    try {
      const res = await this.getSettings();
      if (!res || !res.success || !res.store) return null;
      window.__OPTII_STORE_SETTINGS__ = res;
      const s = res.store;
      const map = res.settings || {};

      const storeName = (s.name || 'Vision Opticals').trim();

      // Store Name elements
      document.querySelectorAll('[data-store-name]').forEach(el => {
        el.textContent = storeName;
      });
      // Brand Logos (render saved logo before store name; hide gracefully if missing or broken)
      document.querySelectorAll('[data-store-logo-slot]').forEach(el => {
        el.innerHTML = '';
        if (s.logo_url) {
          const src = s.logo_url.startsWith('/') || s.logo_url.startsWith('http') ? s.logo_url : `/${s.logo_url}`;
          const img = document.createElement('img');
          img.className = 'brand-logo-img';
          img.src = src;
          img.alt = `${storeName} Logo`;
          img.addEventListener('error', () => { img.remove(); });
          el.appendChild(img);
        }
        const nameSpan = document.createElement('span');
        nameSpan.className = 'brand-logo-text';
        nameSpan.setAttribute('data-store-name', '');
        nameSpan.textContent = storeName;
        el.appendChild(nameSpan);
      });
      // Description / Tagline
      if (s.description) {
        document.querySelectorAll('[data-store-desc]').forEach(el => {
          el.textContent = s.description;
        });
      }
      // Address
      const fullAddress = s.city && !(s.address || '').includes(s.city) ? `${s.address}, ${s.city}` : s.address;
      if (fullAddress) {
        document.querySelectorAll('[data-store-address]').forEach(el => {
          el.textContent = fullAddress;
        });
      }
      // WhatsApp links & labels
      const waRaw = s.whatsapp_number || map.whatsapp_number || s.phone || '+919486552324';
      const waDigits = String(waRaw).replace(/[^0-9]/g, '');
      document.querySelectorAll('[data-store-whatsapp-label]').forEach(el => {
        el.textContent = `WhatsApp Concierge: ${waRaw}`;
      });
      document.querySelectorAll('[data-store-whatsapp-link]').forEach(el => {
        const msg = encodeURIComponent(`Hi ${s.name || 'Vision Opticals'}, I have an enquiry`);
        el.setAttribute('href', `https://wa.me/${waDigits}?text=${msg}`);
      });
      // Email & Map & Socials
      if (s.email) {
        document.querySelectorAll('[data-store-email]').forEach(el => {
          el.textContent = s.email;
          if (el.tagName === 'A') el.setAttribute('href', `mailto:${s.email}`);
        });
      }
      if (s.map_url) {
        document.querySelectorAll('[data-store-map-link]').forEach(el => {
          el.setAttribute('href', s.map_url);
          el.style.display = 'inline-flex';
        });
      }
      if (s.instagram_url) {
        document.querySelectorAll('[data-store-instagram]').forEach(el => {
          el.setAttribute('href', s.instagram_url);
          el.style.display = 'inline-block';
        });
      }
      if (s.facebook_url) {
        document.querySelectorAll('[data-store-facebook]').forEach(el => {
          el.setAttribute('href', s.facebook_url);
          el.style.display = 'inline-block';
        });
      }
      // Announcement bar
      if (map.announcement_text) {
        document.querySelectorAll('[data-announcement-text]').forEach(el => {
          el.textContent = map.announcement_text;
        });
      }
      // Summary hours
      if (Array.isArray(res.hours) && res.hours.length > 0) {
        const openDays = res.hours.filter(h => !h.is_closed);
        if (openDays.length > 0) {
          const mon = res.hours.find(h => h.day_of_week === 1) || openDays[0];
          const sun = res.hours.find(h => h.day_of_week === 0);
          const hoursStr = sun && !sun.is_closed
            ? `Mon–Sat ${mon.open_time}–${mon.close_time} · Sun ${sun.open_time}–${sun.close_time}`
            : `Store Hours: ${mon.open_time}–${mon.close_time}`;
          document.querySelectorAll('[data-store-hours]').forEach(el => {
            el.textContent = hoursStr;
          });
        }
      }
      return res;
    } catch (_) {
      return null;
    }
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
