/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — DEDICATED ATELIER ADMINISTRATION CONTROLLER
 * Professional Optical Retail Operations · Role-Based Access Control
 * ═════════════════════════════════════════════════════════════════════
 */

const OptiiAdmin = {
  state: {
    token: localStorage.getItem('optii_admin_jwt') || '',
    user: null,
    activeSection: 'dashboard',
    products: [],
    inventory: [],
    movements: [],
    appointments: [],
    orders: [],
    enquiries: [],
    lenses: { usages: [], thicknesses: [], coatings: [] },
    brands: [],
    shapes: [],
    categories: [],
    users: [],
    auditLogs: [],
    settings: []
  },

  apiBase: '/api/admin',

  // 1. Initialization
  async init() {
    console.log('[Optii Admin] Initializing administration application...');
    this.bindEvents();

    // Check runtime environment & disable testing aids in production
    try {
      const envRes = await fetch('/api/auth/env');
      const envData = await envRes.json();
      if (envData.is_production) {
        const switcher = document.getElementById('role-switcher-row');
        if (switcher) switcher.style.display = 'none';
        const hint = document.getElementById('login-creds-hint');
        if (hint) hint.style.display = 'none';
        const userInp = document.getElementById('login-username');
        const passInp = document.getElementById('login-password');
        if (userInp) userInp.value = '';
        if (passInp) passInp.value = '';
      }
    } catch (_) {}

    if (this.state.token) {
      await this.verifySession();
    } else {
      this.showLogin();
    }
  },

  // 2. HTTP Helper with Auth Headers & Auto-401 Expiry Interception
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/api') ? endpoint : `${this.apiBase}${endpoint}`;
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.state.token}`,
      ...(options.headers || {})
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json();

      if (res.status === 401 || res.status === 403 && data.message?.includes('expired')) {
        this.toast('Session expired. Please sign in again.', 'error');
        this.logout();
        throw new Error('Session expired');
      }

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`[Admin API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // 3. Session Verification & Auth
  async verifySession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.state.token}` }
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        this.state.user = data.user;
        this.showApp();
      } else {
        this.logout();
      }
    } catch (_) {
      this.logout();
    }
  },

  async handleLogin(e) {
    if (e) e.preventDefault();
    const userInp = document.getElementById('login-username');
    const passInp = document.getElementById('login-password');
    const btn = document.getElementById('btn-login-submit');

    const username = (userInp?.value || '').trim();
    const password = (passInp?.value || '').trim();

    if (!username || !password) {
      this.toast('Please provide both username and password.', 'error');
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying Credentials…';
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.success && data.token) {
        this.state.token = data.token;
        this.state.user = data.user;
        localStorage.setItem('optii_admin_jwt', data.token);
        this.toast(`Welcome back, ${data.user.name || data.user.username}!`, 'success');
        this.showApp();
      } else {
        this.toast(data.message || 'Invalid username or password.', 'error');
      }
    } catch (err) {
      this.toast('Login network error. Ensure server is active.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign In to Operations';
      }
    }
  },

  logout() {
    this.state.token = '';
    this.state.user = null;
    localStorage.removeItem('optii_admin_jwt');
    this.showLogin();
    this.toast('Signed out successfully.', 'info');
  },

  // Quick Role Selector (sets username only; never stores or fills passwords)
  fillRoleCreds(role) {
    const userInp = document.getElementById('login-username');
    const passInp = document.getElementById('login-password');
    document.querySelectorAll('.role-tab-btn').forEach(b => b.classList.remove('active'));

    const activeBtn = document.getElementById(`role-tab-${role}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (userInp) {
      userInp.value = role;
    }
    if (passInp) {
      passInp.value = '';
      passInp.focus();
    }
  },

  // 4. View State Transitions & RBAC Layout Setup
  showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-screen').style.display = 'none';
  },

  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'flex';

    // Update User Badges
    const nameEl = document.getElementById('user-profile-name');
    const roleEl = document.getElementById('user-profile-role');
    if (nameEl) nameEl.textContent = this.state.user?.name || this.state.user?.username || 'Staff';
    if (roleEl) roleEl.textContent = (this.state.user?.role || 'staff').toUpperCase();

    // Apply Role-Based Navigation Guards
    const role = this.state.user?.role;
    document.querySelectorAll('[data-role-guard]').forEach(el => {
      const allowed = el.getAttribute('data-role-guard').split(',');
      el.style.display = allowed.includes(role) ? 'flex' : 'none';
    });

    this.switchSection('dashboard');
  },

  switchSection(sectionId) {
    this.state.activeSection = sectionId;

    // Update Sidebar Navigation state
    document.querySelectorAll('.sidebar-item').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-sec') === sectionId);
    });

    // Update Section Container state
    document.querySelectorAll('.admin-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `sec-${sectionId}`);
    });

    // Update Topbar Title
    const titleMap = {
      dashboard: 'Operations Dashboard Overview',
      products: 'Optical Frame Silhouettes Catalog',
      inventory: 'Atelier Stock & Inventory Control',
      lenses: '4-Step Lens Configurator & Pricing',
      appointments: 'In-Store Eye Test Consultation Queue',
      orders: 'Optical Orders & Precision Lab Glazing',
      enquiries: 'Customer WhatsApp Commerce Inquiries',
      taxonomy: 'Optical Brands, Shapes & Categories',
      audit: 'Administrative Operation Audit Trail',
      users: 'Staff Accounts & Permissions',
      settings: 'Clinic & Store Configuration'
    };
    const titleEl = document.getElementById('topbar-active-title');
    if (titleEl) titleEl.textContent = titleMap[sectionId] || 'Administration';

    // Load section data
    switch (sectionId) {
      case 'dashboard': this.loadDashboard(); break;
      case 'products': this.loadProducts(); break;
      case 'inventory': this.loadInventory(); break;
      case 'lenses': this.loadLenses(); break;
      case 'appointments': this.loadAppointments(); break;
      case 'orders': this.loadOrders(); break;
      case 'enquiries': this.loadEnquiries(); break;
      case 'taxonomy': this.loadTaxonomy(); break;
      case 'audit': this.loadAuditLogs(); break;
      case 'users': this.loadUsers(); break;
      case 'settings': this.loadSettings(); break;
    }

    // Close mobile drawer on item click
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar) sidebar.classList.remove('open');
  },

  toggleMobileSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  },

  // ═════════════════════════════════════════════════════════════════════
  // 5. DASHBOARD SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadDashboard() {
    try {
      const res = await this.request('/summary');
      if (!res.success) return;

      const m = res.metrics;
      document.getElementById('metric-products').textContent = m.active_products || 0;
      document.getElementById('metric-variants').textContent = m.active_variants || 0;
      document.getElementById('metric-low-stock').textContent = m.low_stock_variants || 0;
      document.getElementById('metric-out-stock').textContent = m.out_of_stock_variants || 0;
      document.getElementById('metric-appts-today').textContent = m.appointments_today || 0;
      document.getElementById('metric-appts-pending').textContent = m.pending_appointments || 0;
      document.getElementById('metric-orders').textContent = m.total_orders || 0;
      if (document.getElementById('metric-real-orders-count')) {
        document.getElementById('metric-real-orders-count').textContent = m.real_orders_count || 0;
      }
      if (document.getElementById('metric-sim-orders-count')) {
        document.getElementById('metric-sim-orders-count').textContent = m.simulated_orders_count || 0;
      }
      if (document.getElementById('metric-real-revenue')) {
        document.getElementById('metric-real-revenue').textContent = '₹' + Number(m.real_revenue_inr || 0).toLocaleString('en-IN');
      }
      if (document.getElementById('metric-sim-revenue')) {
        document.getElementById('metric-sim-revenue').textContent = '₹' + Number(m.simulated_revenue_inr || 0).toLocaleString('en-IN');
      }
      document.getElementById('metric-enquiries').textContent = m.new_enquiries || 0;

      // Render Recent Audit Activity
      const activityTable = document.getElementById('dashboard-activity-table');
      if (activityTable) {
        if (!res.recent_activity || res.recent_activity.length === 0) {
          activityTable.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);padding:2rem;">No recent administrative activity logged.</td></tr>';
        } else {
          activityTable.innerHTML = res.recent_activity.map(a => `
            <tr>
              <td><span style="font-family:var(--font-mono);font-size:11px;">${new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
              <td><strong>${a.username}</strong></td>
              <td><span class="badge-status in_stock">${a.action}</span></td>
              <td style="color:var(--ink-secondary);">${a.entity} (${a.entity_id || '—'})</td>
            </tr>
          `).join('');
        }
      }

      // Render Recent Movements
      const movementsTable = document.getElementById('dashboard-movements-table');
      if (movementsTable) {
        if (!res.recent_movements || res.recent_movements.length === 0) {
          movementsTable.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);padding:2rem;">No stock movements recorded.</td></tr>';
        } else {
          movementsTable.innerHTML = res.recent_movements.map(mv => `
            <tr>
              <td>${new Date(mv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
              <td><strong>${mv.product_name}</strong> (${mv.sku})</td>
              <td><span style="font-weight:700;color:${mv.change_quantity >= 0 ? '#166534' : '#991b1b'};">${mv.change_quantity > 0 ? '+' : ''}${mv.change_quantity}</span></td>
              <td><span class="badge-status low_stock">${mv.movement_type.replace('_', ' ')}</span></td>
              <td style="font-size:12px;color:var(--ink-secondary);">${mv.reason}</td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      this.toast('Error loading dashboard metrics.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 6. PRODUCTS CATALOG SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadProducts() {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading optical catalog…</td></tr>';

    try {
      const search = (document.getElementById('products-search-input')?.value || '').trim();
      const res = await this.request(`/products?search=${encodeURIComponent(search)}`);
      this.state.products = res.products || [];

      if (this.state.products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--ink-muted);">No optical frames matched search.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.products.map(p => `
        <tr>
          <td><span style="font-weight:700;font-size:12px;color:var(--ink-secondary);">${p.sku}</span></td>
          <td>
            <div style="font-weight:600;">${p.name}</div>
            <div style="font-size:11px;color:var(--ink-muted);">${p.slug}</div>
          </td>
          <td>${p.brand_name || '—'}</td>
          <td>${p.shape_name || '—'}</td>
          <td><span style="font-size:11px;background:var(--bg-subtle);padding:2px 6px;border-radius:3px;">${p.lens_width_mm}-${p.bridge_width_mm}-${p.temple_length_mm} mm</span></td>
          <td><strong>₹${Number(p.base_price_inr).toLocaleString('en-IN')}</strong></td>
          <td><span style="font-weight:600;">${p.total_stock}</span> <small style="color:var(--ink-muted);">(${p.variant_count} colors)</small></td>
          <td><span class="badge-status ${p.is_active ? 'active' : 'archived'}">${p.is_active ? 'Active' : 'Archived'}</span></td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn-secondary btn-sm" onclick="OptiiAdmin.viewProductVariants(${p.id})">Variants & Photos</button>
              ${this.state.user?.role === 'admin' ? `
                <button class="btn-secondary btn-sm" onclick="OptiiAdmin.toggleProductActive(${p.id}, ${p.is_active ? 0 : 1})">${p.is_active ? 'Archive' : 'Restore'}</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#991b1b;padding:2rem;">Error loading products.</td></tr>';
    }
  },

  async openNewProductModal() {
    this.openModal('modal-new-product');
    const brandSel = document.getElementById('new-prod-brand');
    const catSel = document.getElementById('new-prod-category');
    const shapeSel = document.getElementById('new-prod-shape');

    try {
      const [brandsRes, catsRes, shapesRes] = await Promise.all([
        this.request('/brands'),
        this.request('/categories'),
        this.request('/shapes')
      ]);

      if (brandSel) {
        brandSel.innerHTML = (brandsRes.brands || [])
          .map(b => `<option value="${b.id}">${b.name}</option>`).join('') || '<option value="">No brands found</option>';
      }
      if (catSel) {
        catSel.innerHTML = (catsRes.categories || [])
          .map(c => `<option value="${c.id}">${c.name}</option>`).join('') || '<option value="">No categories found</option>';
      }
      if (shapeSel) {
        shapeSel.innerHTML = (shapesRes.shapes || [])
          .map(s => `<option value="${s.id}">${s.name}</option>`).join('') || '<option value="">No shapes found</option>';
      }
    } catch (err) {
      this.toast('Failed to load brands, categories, or shapes.', 'error');
    }
  },

  async handleCreateProduct(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      slug: form.slug.value.trim(),
      sku: form.sku.value.trim(),
      brand_id: Number(form.brand_id.value),
      category_id: Number(form.category_id.value),
      shape_id: Number(form.shape_id.value),
      base_price_inr: Number(form.base_price_inr.value),
      material: form.material.value.trim(),
      frame_fit: form.frame_fit.value.trim(),
      lens_width_mm: Number(form.lens_width_mm.value),
      bridge_width_mm: Number(form.bridge_width_mm.value),
      temple_length_mm: Number(form.temple_length_mm.value),
      description: form.description.value.trim()
    };

    try {
      const res = await this.request('/products', {
        method: 'POST',
        body: payload
      });

      if (res.success) {
        this.toast('Master frame silhouette created successfully.', 'success');
        this.closeModal('modal-new-product');
        form.reset();
        this.loadProducts();
      }
    } catch (err) {
      this.toast(err.message || 'Error creating product silhouette.', 'error');
    }
  },

  async toggleProductActive(id, newStatus) {
    try {
      await this.request(`/products/${id}/status`, {
        method: 'PATCH',
        body: { is_active: newStatus }
      });
      this.toast(`Product ${newStatus ? 'restored' : 'archived'} successfully.`, 'success');
      this.loadProducts();
    } catch (err) {
      this.toast(err.message || 'Error updating status.', 'error');
    }
  },

  async viewProductVariants(productId) {
    try {
      const res = await this.request(`/products/${productId}`);
      if (!res.success || !res.product) return;

      const p = res.product;
      const modal = document.getElementById('modal-variants-manager');
      document.getElementById('variants-modal-title').textContent = `${p.name} — Colorways & Photography`;
      document.getElementById('variant-add-product-id').value = p.id;

      const listContainer = document.getElementById('variants-list-container');
      if (listContainer) {
        listContainer.innerHTML = p.variants.map(v => `
          <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:16px;height:16px;border-radius:50%;background:${v.color_hex};border:1px solid rgba(0,0,0,0.1);display:inline-block;"></span>
                <span style="font-weight:700;">${v.color_name}</span>
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-muted);">(${v.sku})</span>
                ${v.is_default ? '<span class="badge-status in_stock">Default Colorway</span>' : ''}
              </div>
              <div>
                <span style="font-weight:600;font-size:13px;">Stock: ${v.stock_quantity} units</span>
              </div>
            </div>

            <!-- Photos Grid -->
            <div style="display:flex;gap:8px;overflow-x:auto;padding:6px 0;">
              ${(v.images || []).map(img => `
                <div style="position:relative;width:64px;height:64px;border:1px solid var(--border-light);border-radius:var(--radius-sm);background:var(--bg-subtle);">
                  <img src="/${img.image_url}" style="width:100%;height:100%;object-fit:contain;" alt="${img.image_type}" />
                  <button type="button" onclick="OptiiAdmin.deleteProductImage(${img.id}, ${p.id})" style="position:absolute;top:-4px;right:-4px;background:#991b1b;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;">×</button>
                </div>
              `).join('')}
            </div>

            <!-- Upload Photo Trigger Form -->
            <form style="display:flex;gap:6px;margin-top:8px;" onsubmit="OptiiAdmin.handleUploadImage(event, ${v.id}, ${p.id})">
              <select name="image_type" class="admin-select" style="height:30px;font-size:11px;">
                <option value="studio_front">Studio Front</option>
                <option value="angle_45">45° Perspective</option>
                <option value="model_on_face">Model On-Face</option>
                <option value="hinge_detail">Hinge Craftsmanship Detail</option>
              </select>
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" style="font-size:11px;max-width:180px;" required />
              <button type="submit" class="btn-primary btn-sm" style="height:30px;">Upload View</button>
            </form>
          </div>
        `).join('');
      }

      this.openModal('modal-variants-manager');
    } catch (err) {
      this.toast('Error opening variants editor.', 'error');
    }
  },

  async handleAddVariant(e) {
    e.preventDefault();
    const form = e.target;
    const productId = Number(document.getElementById('variant-add-product-id').value);

    const payload = {
      color_name: form.color_name.value.trim(),
      color_hex: form.color_hex.value.trim(),
      color_secondary_hex: form.color_secondary_hex.value.trim() || null,
      sku: form.sku.value.trim(),
      stock_quantity: Number(form.stock_quantity.value || 0),
      is_default: form.is_default.checked ? 1 : 0
    };

    try {
      const res = await this.request(`/products/${productId}/variants`, {
        method: 'POST',
        body: payload
      });

      if (res.success) {
        this.toast('Variant colorway added.', 'success');
        form.reset();
        this.viewProductVariants(productId);
        this.loadProducts();
      }
    } catch (err) {
      this.toast(err.message || 'Error adding variant.', 'error');
    }
  },

  async handleUploadImage(e, variantId, productId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
      const res = await fetch(`/api/admin/variants/${variantId}/images`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.state.token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.toast('Photography view uploaded successfully.', 'success');
        this.viewProductVariants(productId);
      } else {
        throw new Error(data.message || 'Upload error');
      }
    } catch (err) {
      this.toast(err.message || 'Image upload failed.', 'error');
    }
  },

  async deleteProductImage(imageId, productId) {
    if (!confirm('Are you sure you want to remove this product image?')) return;
    try {
      await this.request(`/images/${imageId}`, { method: 'DELETE' });
      this.toast('Image deleted.', 'info');
      this.viewProductVariants(productId);
    } catch (err) {
      this.toast(err.message || 'Failed to delete image.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 7. STOCK & INVENTORY CONTROL SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadInventory() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading live inventory counts…</td></tr>';

    try {
      const search = (document.getElementById('inv-search-input')?.value || '').trim();
      const statusFilter = document.getElementById('inv-filter-status')?.value || 'all';

      const res = await this.request(`/inventory?search=${encodeURIComponent(search)}&stock_status=${statusFilter}`);
      this.state.inventory = res.inventory || [];

      if (this.state.inventory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">No inventory items matching filter.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.inventory.map(it => {
        let statusBadge = '<span class="badge-status in_stock">In Stock</span>';
        if (it.stock_quantity === 0) {
          statusBadge = '<span class="badge-status out_of_stock">Out of Stock</span>';
        } else if (it.stock_quantity <= 5) {
          statusBadge = '<span class="badge-status low_stock">Low Stock (≤5)</span>';
        }

        return `
          <tr>
            <td><span style="font-family:var(--font-mono);font-weight:700;">${it.sku}</span></td>
            <td><strong>${it.product_name}</strong></td>
            <td>
              <span style="display:inline-flex;align-items:center;gap:6px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${it.color_hex};border:1px solid rgba(0,0,0,0.1);"></span>
                ${it.color_name}
              </span>
            </td>
            <td>${it.brand_name} · ${it.category_name}</td>
            <td style="font-size:16px;font-weight:700;">${it.stock_quantity}</td>
            <td>${statusBadge}</td>
            <td>
              <button class="btn-primary btn-sm" onclick="OptiiAdmin.openStockAdjustModal(${it.variant_id}, '${it.sku}', '${it.product_name}', ${it.stock_quantity})">
                Adjust Stock
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#991b1b;padding:2rem;">Error loading inventory.</td></tr>';
    }
  },

  openStockAdjustModal(variantId, sku, productName, currentStock) {
    document.getElementById('adj-variant-id').value = variantId;
    document.getElementById('adj-item-title').textContent = `${productName} (${sku})`;
    document.getElementById('adj-current-stock').textContent = `${currentStock} units in atelier`;
    document.getElementById('adj-delta').value = '1';
    document.getElementById('adj-reason').value = '';
    this.openModal('modal-adjust-stock');
  },

  async handleStockAdjustment(e) {
    e.preventDefault();
    const form = e.target;
    const variantId = Number(document.getElementById('adj-variant-id').value);
    const delta = Number(form.change_quantity.value);
    const movementType = form.movement_type.value;
    const reason = form.reason.value.trim();

    if (!reason) {
      this.toast('Mandatory adjustment audit reason required.', 'error');
      return;
    }

    try {
      const res = await this.request('/inventory/adjust', {
        method: 'POST',
        body: {
          variant_id: variantId,
          change_quantity: delta,
          movement_type: movementType,
          reason
        }
      });

      if (res.success) {
        this.toast(res.message, 'success');
        this.closeModal('modal-adjust-stock');
        this.loadInventory();
      }
    } catch (err) {
      this.toast(err.message || 'Failed to adjust stock.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 8. 4-STEP LENS CONFIGURATOR & PRICING SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadLenses() {
    try {
      const res = await this.request('/lenses');
      this.state.lenses = res;

      // Table 1: Usage Tiers
      const usagesBody = document.getElementById('lenses-usages-body');
      if (usagesBody) {
        usagesBody.innerHTML = res.usages.map(u => `
          <tr>
            <td><strong>${u.name}</strong></td>
            <td style="font-size:12px;color:var(--ink-secondary);">${u.description || '—'}</td>
            <td><strong>₹${Number(u.base_price_inr).toLocaleString('en-IN')}</strong></td>
            <td><span class="badge-status ${u.is_active ? 'active' : 'archived'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
            <td>
              <button class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('usage', ${u.id}, '${u.name}', ${u.base_price_inr})">Edit Fee</button>
            </td>
          </tr>
        `).join('');
      }

      // Table 2: Index Thickness Ratings
      const thickBody = document.getElementById('lenses-thicknesses-body');
      if (thickBody) {
        thickBody.innerHTML = res.thicknesses.map(t => `
          <tr>
            <td><strong>${t.name}</strong> (${t.index_rating})</td>
            <td style="font-size:12px;color:var(--ink-secondary);">${t.recommendation_sph || '—'}</td>
            <td><strong>+₹${Number(t.price_inr).toLocaleString('en-IN')}</strong></td>
            <td><span class="badge-status ${t.is_active ? 'active' : 'archived'}">${t.is_active ? 'Active' : 'Disabled'}</span></td>
            <td>
              <button class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('thickness', ${t.id}, '${t.name}', ${t.price_inr})">Edit Fee</button>
            </td>
          </tr>
        `).join('');
      }

      // Table 3: Coatings
      const coatBody = document.getElementById('lenses-coatings-body');
      if (coatBody) {
        coatBody.innerHTML = res.coatings.map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td style="font-size:12px;color:var(--ink-secondary);">${c.description || '—'}</td>
            <td><strong>+₹${Number(c.price_inr).toLocaleString('en-IN')}</strong></td>
            <td><span class="badge-status ${c.is_active ? 'active' : 'archived'}">${c.is_active ? 'Active' : 'Disabled'}</span></td>
            <td>
              <button class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('coating', ${c.id}, '${c.name}', ${c.price_inr})">Edit Fee</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      this.toast('Error loading lens configuration options.', 'error');
    }
  },

  editLensPrice(category, id, name, currentPrice) {
    const newPrice = prompt(`Update pricing for [${name}] in INR (₹):`, currentPrice);
    if (newPrice === null || isNaN(Number(newPrice)) || Number(newPrice) < 0) return;

    let endpoint = '';
    let payload = {};
    if (category === 'usage') {
      endpoint = `/lenses/usages/${id}`;
      payload = { base_price_inr: Number(newPrice) };
    } else if (category === 'thickness') {
      endpoint = `/lenses/thicknesses/${id}`;
      payload = { price_inr: Number(newPrice) };
    } else if (category === 'coating') {
      endpoint = `/lenses/coatings/${id}`;
      payload = { price_inr: Number(newPrice) };
    }

    this.request(endpoint, { method: 'PUT', body: payload })
      .then(() => {
        this.toast(`Updated ${name} price to ₹${Number(newPrice).toLocaleString('en-IN')}`, 'success');
        this.loadLenses();
      })
      .catch(err => this.toast(err.message || 'Error updating price.', 'error'));
  },

  // ═════════════════════════════════════════════════════════════════════
  // 9. APPOINTMENTS QUEUE SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadAppointments() {
    const tbody = document.getElementById('appointments-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading patient consultations…</td></tr>';

    try {
      const statusFilter = document.getElementById('appt-filter-status')?.value || '';
      const res = await this.request(`/appointments?status=${statusFilter}`);
      this.state.appointments = res.appointments || [];

      if (this.state.appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">No consultations matching filter.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.appointments.map(a => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">${a.appointment_number}</span></td>
          <td><strong>${a.customer_name}</strong><div style="font-size:11px;color:var(--ink-muted);">${a.customer_phone}</div></td>
          <td>${a.appointment_date}</td>
          <td><span style="font-weight:600;">${a.start_time} – ${a.end_time}</span></td>
          <td><span class="badge-status ${a.status}">${a.status}</span></td>
          <td style="font-size:12px;color:var(--ink-secondary);max-width:200px;">${a.notes || '—'}</td>
          <td>
            <div style="display:flex;gap:4px;">
              ${a.status !== 'completed' && a.status !== 'cancelled' ? `
                <button class="btn-primary btn-sm" onclick="OptiiAdmin.updateApptStatus(${a.id}, 'completed')">Done</button>
                <button class="btn-secondary btn-sm" onclick="OptiiAdmin.openRescheduleModal(${a.id}, '${a.appointment_number}', '${a.appointment_date}', '${a.start_time}')">Reschedule</button>
                <button class="btn-danger btn-sm" onclick="OptiiAdmin.updateApptStatus(${a.id}, 'cancelled')">Cancel</button>
              ` : `
                <span style="font-size:11px;color:var(--ink-muted);">Finalized</span>
              `}
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#991b1b;padding:2rem;">Error loading appointments.</td></tr>';
    }
  },

  async updateApptStatus(id, newStatus) {
    try {
      await this.request(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: { status: newStatus }
      });
      this.toast(`Appointment marked as ${newStatus}.`, 'success');
      this.loadAppointments();
    } catch (err) {
      this.toast(err.message || 'Error updating appointment.', 'error');
    }
  },

  openRescheduleModal(id, apptNumber, currentDate, currentTime) {
    document.getElementById('resched-appt-id').value = id;
    document.getElementById('resched-title').textContent = `Reschedule ${apptNumber}`;
    document.getElementById('resched-date').value = currentDate;
    document.getElementById('resched-time').value = currentTime;
    this.openModal('modal-reschedule-appt');
  },

  async handleReschedule(e) {
    e.preventDefault();
    const id = Number(document.getElementById('resched-appt-id').value);
    const date = document.getElementById('resched-date').value;
    const time = document.getElementById('resched-time').value;

    try {
      const res = await this.request(`/appointments/${id}/reschedule`, {
        method: 'PATCH',
        body: { appointment_date: date, start_time: time }
      });

      if (res.success) {
        this.toast(res.message, 'success');
        this.closeModal('modal-reschedule-appt');
        this.loadAppointments();
      }
    } catch (err) {
      this.toast(err.message || 'Error rescheduling appointment.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 10. ORDERS & LAB GLAZING QUEUE SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadOrders() {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading optical orders…</td></tr>';

    try {
      const search = (document.getElementById('orders-search-input')?.value || '').trim();
      const statusFilter = document.getElementById('orders-filter-status')?.value || '';

      const res = await this.request(`/orders?search=${encodeURIComponent(search)}&order_status=${statusFilter}`);
      this.state.orders = res.orders || [];

      if (this.state.orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--ink-muted);">No orders matching filter.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.orders.map(o => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">${o.order_number}</span></td>
          <td><strong>${o.customer_name}</strong><div style="font-size:11px;color:var(--ink-muted);">${o.customer_phone}</div></td>
          <td><strong>₹${Number(o.total_amount_inr).toLocaleString('en-IN')}</strong></td>
          <td>
            <span class="badge-status ${o.payment_status}">${o.payment_status} (${o.payment_method.toUpperCase()})</span>
            ${o.is_simulated_payment 
              ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:3px;font-weight:700;margin-left:4px;" title="Demonstration Sandbox — No actual funds collected">SANDBOX</span>'
              : '<span style="font-size:10px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:3px;font-weight:700;margin-left:4px;" title="Verified Live Gateway Transaction">LIVE</span>'
            }
          </td>
          <td><span class="badge-status ${o.order_status}">${o.order_status.replace('_', ' ')}</span></td>
          <td style="font-size:12px;font-family:var(--font-mono);">${o.tracking_number || '—'}</td>
          <td>${new Date(o.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td>
            <button class="btn-primary btn-sm" onclick="OptiiAdmin.viewOrderDetail('${o.order_number}')">View & Transition</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#991b1b;padding:2rem;">Error loading orders.</td></tr>';
    }
  },

  async viewOrderDetail(orderNumber) {
    try {
      const res = await this.request(`/orders/${orderNumber}`);
      if (!res.success || !res.order) return;

      const o = res.order;
      document.getElementById('order-detail-title').textContent = `Order ${o.order_number}`;
      document.getElementById('order-detail-target-num').value = o.order_number;

      const container = document.getElementById('order-detail-content');
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--bg-subtle);padding:12px;border-radius:var(--radius-sm);margin-bottom:1rem;font-size:13px;">
          <div>
            <strong>Patron:</strong> ${o.customer_name} (${o.customer_phone})<br/>
            <strong>Email:</strong> ${o.customer_email || '—'}<br/>
            <strong>Delivery Mode:</strong> ${o.delivery_method === 'pickup' ? 'Atelier Collection (Thiruvarur)' : 'Express Courier'}
          </div>
          <div>
            <strong>Destination:</strong> ${o.shipping_address}, ${o.city} — ${o.pincode}<br/>
            <strong>Payment Mode:</strong> ${o.is_simulated_payment ? '<span style="color:#92400e;font-weight:700;">Sandbox Simulation (Demo)</span>' : '<span style="color:#166534;font-weight:700;">Live Real Payment</span>'}<br/>
            <strong>Gateway Ref:</strong> <span style="font-family:var(--font-mono);font-size:11px;">${o.payment_gateway_ref || o.payment_gateway_order_id || 'None'}</span><br/>
            <strong>Payment Status:</strong> <span class="badge-status ${o.payment_status}">${o.payment_status.toUpperCase()}</span>
            ${o.payment_status === 'refunded' ? `<div style="color:#991b1b;font-size:11px;margin-top:2px;">Refunded: ₹${Number(o.refund_amount_inr || o.total_amount_inr).toLocaleString('en-IN')} (${o.refund_reason || 'Administrative refund'})</div>` : ''}
            <br/><strong>Placed:</strong> ${new Date(o.created_at).toLocaleString()}
          </div>
        </div>

        <h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">Silhouettes & Prescription Lenses:</h4>
        <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:8px;margin-bottom:1rem;">
          ${(o.items || []).map(it => `
            <div style="padding:8px 0;border-bottom:1px dashed var(--border-light);font-size:13px;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${it.product_name}</strong> (${it.color_name || 'Standard'}) × ${it.quantity || 1}
                <span>₹${Number(it.total_price_inr || it.price_inr || 0).toLocaleString('en-IN')}</span>
              </div>
              <div style="font-size:11px;color:var(--ink-secondary);margin-top:2px;">
                ${it.configured_lenses ? `👁️ ${it.configured_lenses.usage_name} · ${it.configured_lenses.thickness_name} · ${it.configured_lenses.coating_name}` : 'Frame Only'}
              </div>
              ${it.prescription_token ? `
                <div style="font-size:11px;background:#ecfdf5;color:#065f46;display:inline-block;padding:2px 6px;border-radius:3px;margin-top:4px;">
                  Prescription Token Attached: <strong>${it.prescription_token}</strong>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Payment Actions (Refund) -->
        ${(o.payment_status === 'paid' && o.order_status !== 'cancelled') ? `
          <div style="background:#fef2f2;border:1px solid #fee2e2;padding:10px;border-radius:var(--radius-sm);margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="color:#991b1b;font-size:13px;">Process Financial Refund</strong>
              <div style="font-size:11px;color:#7f1d1d;">Issues reverse refund to customer for ₹${Number(o.total_amount_inr).toLocaleString('en-IN')}.</div>
            </div>
            <button class="btn-danger btn-sm" onclick="OptiiAdmin.refundOrder('${o.order_number}', ${o.total_amount_inr})">Issue Full Refund</button>
          </div>
        ` : ''}

        <!-- Lifecycle Transition Selector -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:1rem;">
          <div class="form-group">
            <label class="form-label">Advance Lifecycle Stage</label>
            <select id="order-transition-status" class="admin-select" style="width:100%;">
              ${['placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled'].map(st => `
                <option value="${st}" ${o.order_status === st ? 'selected' : ''}>${st.replace('_', ' ').toUpperCase()}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Carrier Consignment #</label>
            <input type="text" id="order-transition-tracking" class="form-control" value="${o.tracking_number || ''}" placeholder="BLUEDART-OPT-XXXXXX" />
          </div>
        </div>
      `;

      this.openModal('modal-order-detail');
    } catch (err) {
      this.toast('Error opening order details.', 'error');
    }
  },

  async refundOrder(orderNumber, amount) {
    if (!confirm(`Are you sure you want to process a full refund of ₹${Number(amount).toLocaleString('en-IN')} for order #${orderNumber}?`)) {
      return;
    }
    try {
      const res = await this.request(`/orders/${orderNumber}/payment`, {
        method: 'PATCH',
        body: { action: 'refund', amount_inr: amount, reason: 'Staff initiated refund from Atelier admin portal' }
      });
      if (res.success) {
        this.toast(`Refund processed for order #${orderNumber}.`, 'success');
        this.closeModal('modal-order-detail');
        this.loadOrders();
        this.loadDashboard();
      }
    } catch (err) {
      this.toast(err.message || 'Error processing refund.', 'error');
    }
  },

  async handleOrderTransition() {
    const orderNumber = document.getElementById('order-detail-target-num').value;
    const status = document.getElementById('order-transition-status').value;
    const tracking = document.getElementById('order-transition-tracking').value.trim();

    try {
      const res = await this.request(`/orders/${orderNumber}/status`, {
        method: 'PATCH',
        body: { order_status: status, tracking_number: tracking }
      });

      if (res.success) {
        this.toast(res.message, 'success');
        this.closeModal('modal-order-detail');
        this.loadOrders();
      }
    } catch (err) {
      this.toast(err.message || 'Error updating order status.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 11. CUSTOMER ENQUIRIES & WHATSAPP
  // ═════════════════════════════════════════════════════════════════════
  async loadEnquiries() {
    const tbody = document.getElementById('enquiries-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading customer leads…</td></tr>';

    try {
      const res = await this.request('/enquiries');
      this.state.enquiries = res.enquiries || [];

      if (this.state.enquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ink-muted);">No enquiries recorded.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.enquiries.map(enq => {
        let payload = {};
        try { payload = JSON.parse(enq.enquiry_payload); } catch (_) {}

        const cleanPhone = (enq.customer_phone || '').replace(/[^0-9]/g, '');
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hello! Thank you for inquiring with Optii Atelier regarding ' + (payload.product_name || 'our optical collection') + '.')}` : '#';

        return `
          <tr>
            <td><span style="font-family:var(--font-mono);font-size:11px;">#${enq.id}</span></td>
            <td><strong>${enq.customer_name || 'Patron'}</strong></td>
            <td>${enq.customer_phone || '—'}</td>
            <td><strong>${payload.product_name || (payload.items ? `${payload.items.length} items in Bag` : 'Optical Enquiry')}</strong></td>
            <td><span class="badge-status ${enq.status === 'converted' ? 'active' : 'low_stock'}">${enq.status}</span></td>
            <td>${new Date(enq.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td>
              ${cleanPhone ? `
                <a href="${waLink}" target="_blank" class="btn-primary btn-sm" style="background:#25D366;border-color:#25D366;">WhatsApp Chat</a>
              ` : '—'}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#991b1b;padding:2rem;">Error loading enquiries.</td></tr>';
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 12. TAXONOMY MANAGEMENT (BRANDS, SHAPES, CATEGORIES)
  // ═════════════════════════════════════════════════════════════════════
  async loadTaxonomy() {
    try {
      const [brandsRes, shapesRes, catsRes] = await Promise.all([
        this.request('/brands'),
        this.request('/shapes'),
        this.request('/categories')
      ]);

      // Brands Table
      const bTable = document.getElementById('taxonomy-brands-body');
      if (bTable) {
        bTable.innerHTML = (brandsRes.brands || []).map(b => `
          <tr>
            <td><strong>${b.name}</strong></td>
            <td><span style="font-family:var(--font-mono);font-size:11px;">${b.slug}</span></td>
            <td>${b.product_count || 0} products</td>
            <td>
              ${this.state.user?.role === 'admin' ? `
                <button class="btn-danger btn-sm" onclick="OptiiAdmin.deleteTaxonomyItem('brands', ${b.id})">Delete</button>
              ` : '—'}
            </td>
          </tr>
        `).join('');
      }

      // Shapes Table
      const sTable = document.getElementById('taxonomy-shapes-body');
      if (sTable) {
        sTable.innerHTML = (shapesRes.shapes || []).map(s => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  ${s.svg_icon_path ? `<path d="${s.svg_icon_path}" />` : '<circle cx="12" cy="12" r="8"/>'}
                </svg>
                <strong>${s.name}</strong>
              </div>
            </td>
            <td><span style="font-family:var(--font-mono);font-size:11px;">${s.slug}</span></td>
            <td>${s.product_count || 0} frames</td>
            <td>
              ${this.state.user?.role === 'admin' ? `
                <button class="btn-danger btn-sm" onclick="OptiiAdmin.deleteTaxonomyItem('shapes', ${s.id})">Delete</button>
              ` : '—'}
            </td>
          </tr>
        `).join('');
      }

      // Categories Table
      const cTable = document.getElementById('taxonomy-cats-body');
      if (cTable) {
        cTable.innerHTML = (catsRes.categories || []).map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td><span style="font-family:var(--font-mono);font-size:11px;">${c.slug}</span></td>
            <td>${c.product_count || 0} items</td>
            <td>—</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      this.toast('Error loading taxonomy.', 'error');
    }
  },

  async deleteTaxonomyItem(type, id) {
    if (!confirm(`Are you sure you want to delete this ${type.slice(0, -1)}? Active product references will block deletion.`)) return;
    try {
      await this.request(`/${type}/${id}`, { method: 'DELETE' });
      this.toast('Item deleted.', 'info');
      this.loadTaxonomy();
    } catch (err) {
      this.toast(err.message || 'Cannot delete referenced item.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 13. AUDIT LOGS (ADMIN ONLY)
  // ═════════════════════════════════════════════════════════════════════
  async loadAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading audit trail…</td></tr>';

    try {
      const res = await this.request('/audit-logs');
      this.state.auditLogs = res.logs || [];

      if (this.state.auditLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--ink-muted);">No administrative audit entries logged.</td></tr>';
        return;
      }

      tbody.innerHTML = this.state.auditLogs.map(l => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-size:11px;">#${l.id}</span></td>
          <td>${new Date(l.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</td>
          <td><strong>${l.username}</strong></td>
          <td><span class="badge-status in_stock">${l.action}</span></td>
          <td>${l.entity} (${l.entity_id || '—'})</td>
          <td><span style="font-family:var(--font-mono);font-size:11px;">${l.ip_address}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#991b1b;padding:2rem;">Error loading audit logs.</td></tr>';
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 14. STAFF ACCOUNTS MANAGEMENT (ADMIN ONLY)
  // ═════════════════════════════════════════════════════════════════════
  async loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--ink-muted);">Loading staff directory…</td></tr>';

    try {
      const res = await this.request('/users');
      this.state.users = res.users || [];

      tbody.innerHTML = this.state.users.map(u => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">#${u.id}</span></td>
          <td><strong>${u.full_name}</strong></td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${u.username}</span></td>
          <td><span class="badge-status ${u.role === 'admin' ? 'in_stock' : (u.role === 'optometrist' ? 'shipped' : 'low_stock')}">${u.role.toUpperCase()}</span></td>
          <td>
            ${u.id !== this.state.user?.id ? `
              <button class="btn-danger btn-sm" onclick="OptiiAdmin.deleteUser(${u.id}, '${u.username}')">Remove</button>
            ` : '<span style="font-size:11px;color:var(--ink-muted);">Active Account</span>'}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#991b1b;padding:2rem;">Error loading staff.</td></tr>';
    }
  },

  openNewUserModal() {
    this.openModal('modal-new-user');
  },

  async handleCreateUser(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      username: form.username.value.trim(),
      password: form.password.value.trim(),
      full_name: form.full_name.value.trim(),
      role: form.role.value
    };

    try {
      const res = await this.request('/users', {
        method: 'POST',
        body: payload
      });

      if (res.success) {
        this.toast(`Staff member ${payload.username} created.`, 'success');
        this.closeModal('modal-new-user');
        form.reset();
        this.loadUsers();
      }
    } catch (err) {
      this.toast(err.message || 'Error creating user.', 'error');
    }
  },

  async deleteUser(id, username) {
    if (!confirm(`Are you sure you want to revoke access for ${username}?`)) return;
    try {
      await this.request(`/users/${id}`, { method: 'DELETE' });
      this.toast(`User ${username} removed.`, 'info');
      this.loadUsers();
    } catch (err) {
      this.toast(err.message || 'Error deleting user.', 'error');
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 15. CLINIC SETTINGS SECTION
  // ═════════════════════════════════════════════════════════════════════
  async loadSettings() {
    try {
      const res = await this.request('/settings');
      if (!res.success) return;

      const store = res.store || {};
      const nameEl = document.getElementById('set-store-name');
      const addrEl = document.getElementById('set-store-address');
      const phoneEl = document.getElementById('set-store-phone');
      if (nameEl) nameEl.value = store.name || '';
      if (addrEl) addrEl.value = store.address || '';
      if (phoneEl) phoneEl.value = store.phone || '';
    } catch (err) {
      this.toast('Error loading clinic settings.', 'error');
    }
  },

  async handleSaveSettings(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const name = (document.getElementById('set-store-name')?.value || '').trim();
    const address = (document.getElementById('set-store-address')?.value || '').trim();
    const phone = (document.getElementById('set-store-phone')?.value || '').trim();

    if (!name || !address || !phone) {
      this.toast('Atelier name, address, and WhatsApp number are required.', 'error');
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
      }

      const res = await this.request('/settings', {
        method: 'PUT',
        body: { name, address, phone }
      });

      if (res && res.success) {
        this.toast(res.message || 'Clinic settings saved successfully.', 'success');
      } else {
        throw new Error(res?.message || 'Unable to save clinic settings.');
      }
    } catch (err) {
      this.toast(err.message || 'Failed to save clinic settings.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Atelier Settings';
      }
    }
  },

  // ═════════════════════════════════════════════════════════════════════
  // 16. MODAL & TOAST HELPERS
  // ═════════════════════════════════════════════════════════════════════
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  },

  toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  },

  bindEvents() {
    // Global ESC key dismisses modals & mobile sidebar
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.admin-modal-backdrop.active').forEach(m => m.classList.remove('active'));
        const sidebar = document.getElementById('admin-sidebar');
        if (sidebar) sidebar.classList.remove('open');
      }
    });
  }
};

window.OptiiAdmin = OptiiAdmin;
document.addEventListener('DOMContentLoaded', () => OptiiAdmin.init());
