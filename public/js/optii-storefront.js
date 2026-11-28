/**
 * Optii Storefront Application
 * Implements the Ace & Tate European Optical Retail Customer Journey
 */

function resolveStoreImgSrc(url, fallback = 'images/tortoise_round_front.jpg') {
  const clean = String(url || fallback || '').trim();
  if (!clean) return `/${fallback}`;
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:') || clean.startsWith('/')) {
    return clean;
  }
  return `/${clean}`;
}

const OptiiApp = {
  // Reactive State
  state: {
    category: 'all',
    filters: {
      shape: '',
      brand: '',
      gender: '',
      fit: '',
      material: '',
      color: '',
      availability: '',
      min_price: '',
      max_price: '',
      sort: 'default',
      search: ''
    },
    shapes: [],
    brands: [],
    categories: [],
    products: [],
    cart: JSON.parse(localStorage.getItem('optii_cart') || '[]'),
    wishlist: JSON.parse(localStorage.getItem('optii_wishlist') || '[]'),
    currentProduct: null,
    selectedVariant: null
  },

  // 1. Initialization
  async init() {
    this.hydrateStateFromUrl();
    this.bindEvents();
    this.updateBadges();

    window.addEventListener('popstate', () => {
      this.hydrateStateFromUrl();
      this.renderShapesShowcase();
      this.renderFilterShapes();
      this.renderFilterBrands();
      this.loadProducts({ skipUrlSync: true });
    });

    try {
      await Promise.all([
        OptiiAPI.hydrateStorefrontBranding(),
        this.loadShapes(),
        this.loadBrands(),
        this.loadCategories(),
        this.loadProducts({ skipUrlSync: true })
      ]);

      if (window.location.hash === '#book') {
        setTimeout(() => this.openAppointmentModal(), 200);
      }
    } catch (err) {
      console.error('[Optii Init Error]:', err);
    }
  },

  hydrateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    this.state.category = params.get('category') || 'all';
    this.state.filters = {
      shape: params.get('shape') || '',
      brand: params.get('brand') || '',
      gender: params.get('gender') || '',
      fit: params.get('fit') || '',
      material: params.get('material') || '',
      color: params.get('color') || '',
      availability: params.get('availability') || '',
      min_price: params.get('min_price') || '',
      max_price: params.get('max_price') || '',
      sort: params.get('sort') || 'default',
      search: params.get('search') || ''
    };
  },

  syncUrlState() {
    const params = new URLSearchParams();
    if (this.state.category && this.state.category !== 'all') {
      params.set('category', this.state.category);
    }
    Object.entries(this.state.filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined && !(k === 'sort' && v === 'default')) {
        params.set(k, v);
      }
    });
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState(null, '', nextUrl);
    }
  },

  // 2. Event Binding
  bindEvents() {
    // Navigation Drawer
    const menuTrigger = document.getElementById('mobile-menu-trigger');
    const drawerBackdrop = document.getElementById('nav-drawer-backdrop');
    const drawerCloseBtn = document.getElementById('nav-drawer-close');

    if (menuTrigger) menuTrigger.addEventListener('click', () => this.toggleNavDrawer(true));
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => this.toggleNavDrawer(false));
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', () => this.toggleNavDrawer(false));

    // Filter Drawer
    const openFiltersBtn = document.getElementById('btn-open-filters');
    const filterBackdrop = document.getElementById('filter-drawer-backdrop');
    const filterCloseBtn = document.getElementById('filter-drawer-close');
    const filterApplyBtn = document.getElementById('btn-filter-apply');
    const filterClearBtn = document.getElementById('btn-filter-clear');

    if (openFiltersBtn) openFiltersBtn.addEventListener('click', () => this.toggleFilterDrawer(true));
    if (filterBackdrop) filterBackdrop.addEventListener('click', () => this.toggleFilterDrawer(false));
    if (filterCloseBtn) filterCloseBtn.addEventListener('click', () => this.toggleFilterDrawer(false));
    if (filterApplyBtn) filterApplyBtn.addEventListener('click', () => {
      this.toggleFilterDrawer(false);
      this.loadProducts();
    });
    if (filterClearBtn) filterClearBtn.addEventListener('click', () => this.clearFilters());

    // Search Modal
    const searchTrigger = document.getElementById('header-search-btn');
    const searchBackdrop = document.getElementById('search-modal-backdrop');
    const searchInput = document.getElementById('search-modal-input');
    const searchClose = document.getElementById('search-modal-close');

    if (searchTrigger) searchTrigger.addEventListener('click', () => this.toggleSearchModal(true));
    if (searchBackdrop) searchBackdrop.addEventListener('click', (e) => {
      if (e.target === searchBackdrop) this.toggleSearchModal(false);
    });
    if (searchClose) searchClose.addEventListener('click', () => this.toggleSearchModal(false));
    if (searchInput) searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));

    // Cart Drawer Triggers
    const cartBtn = document.getElementById('header-cart-btn');
    const cartBackdrop = document.getElementById('cart-drawer-backdrop');
    const cartCloseBtn = document.getElementById('cart-drawer-close');
    if (cartBtn) cartBtn.addEventListener('click', () => this.toggleCartDrawer(true));
    if (cartBackdrop) cartBackdrop.addEventListener('click', () => this.toggleCartDrawer(false));
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => this.toggleCartDrawer(false));

    // Wishlist Drawer Triggers
    const wishlistBtn = document.getElementById('header-wishlist-btn');
    const wishlistBackdrop = document.getElementById('wishlist-drawer-backdrop');
    const wishlistCloseBtn = document.getElementById('wishlist-drawer-close');
    if (wishlistBtn) wishlistBtn.addEventListener('click', () => this.toggleWishlistDrawer(true));
    if (wishlistBackdrop) wishlistBackdrop.addEventListener('click', () => this.toggleWishlistDrawer(false));
    if (wishlistCloseBtn) wishlistCloseBtn.addEventListener('click', () => this.toggleWishlistDrawer(false));

    // Sort Dropdown
    const sortSelect = document.getElementById('plp-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.state.filters.sort = e.target.value;
        this.loadProducts();
      });
    }

    // Appointment Booking Trigger
    const bookTestBtn = document.getElementById('btn-book-test-header');
    if (bookTestBtn) bookTestBtn.addEventListener('click', () => this.openAppointmentModal());
  },

  // 3. UI Toggles
  toggleNavDrawer(open) {
    const drawer = document.getElementById('nav-drawer');
    const backdrop = document.getElementById('nav-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
    }
  },

  toggleFilterDrawer(open) {
    const drawer = document.getElementById('filter-drawer');
    const backdrop = document.getElementById('filter-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
    }
  },

  toggleSearchModal(open) {
    const modal = document.getElementById('search-modal-backdrop');
    const input = document.getElementById('search-modal-input');
    if (modal) {
      modal.classList.toggle('active', open);
      if (open && input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
        this.renderSearchResults([]);
      }
    }
  },

  toggleCartDrawer(open) {
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
      if (open) this.renderCart();
    }
  },

  toggleWishlistDrawer(open) {
    const drawer = document.getElementById('wishlist-drawer');
    const backdrop = document.getElementById('wishlist-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
      if (open) this.renderWishlist();
    }
  },

  toggleDrawerAccordion(element) {
    const item = element.closest('.drawer-accordion');
    if (item) item.classList.toggle('open');
  },

  // 4. Data Loading: Shapes, Brands, Categories, Products
  async loadShapes() {
    try {
      const data = await OptiiAPI.getShapes();
      this.state.shapes = data.shapes || [];
      this.renderShapesShowcase();
      this.renderFilterShapes();
    } catch (err) {
      console.warn('Could not load shapes:', err);
    }
  },

  async loadBrands() {
    try {
      const data = await OptiiAPI.getBrands();
      this.state.brands = data.brands || [];
      this.renderFilterBrands();
    } catch (err) {
      console.warn('Could not load brands:', err);
    }
  },

  async loadCategories() {
    try {
      const data = await OptiiAPI.getCategories();
      this.state.categories = data.categories || [];
      this.renderDynamicNavCategories();
    } catch (err) {
      console.warn('Could not load categories:', err);
    }
  },

  renderDynamicNavCategories() {
    const navDesktop = document.querySelector('.nav-links-desktop');
    const excludedHeaderSlugs = new Set(['men-sunglasses', 'women-sunglasses', 'men', 'women']);
    const topCategories = (this.state.categories || []).filter(cat => !excludedHeaderSlugs.has(String(cat.slug || '').toLowerCase()));
    if (navDesktop && topCategories.length > 0) {
      navDesktop.innerHTML = `
        <a class="nav-item ${this.state.category === 'all' ? 'active' : ''}" href="#all" onclick="event.preventDefault(); OptiiApp.selectCategoryFilter('all');">All</a>
      ` + topCategories.slice(0, 6).map(cat => `
        <a class="nav-item ${this.state.category === cat.slug || this.state.category === cat.category_type ? 'active' : ''}"
           href="#${cat.slug}"
           onclick="event.preventDefault(); OptiiApp.selectCategoryFilter('${cat.slug}');">${cat.name}</a>
      `).join('');
    }
  },

  selectCategoryFilter(catSlug) {
    this.state.category = catSlug;
    this.renderDynamicNavCategories();
    this.loadProducts();
  },

  renderFilterBrands() {
    const container = document.getElementById('filter-brands-grid');
    if (!container) return;
    container.innerHTML = this.state.brands.map(b => `
      <button type="button"
              class="filter-pill-chip filter-brand-chip ${this.state.filters.brand === b.slug ? 'active' : ''}"
              data-brand="${b.slug}"
              onclick="OptiiApp.setBrandFilter('${b.slug}')">${b.name}</button>
    `).join('');
  },

  setBrandFilter(brandSlug) {
    this.state.filters.brand = (this.state.filters.brand === brandSlug) ? '' : brandSlug;
    this.renderFilterBrands();
    this.previewFilterResultsCount();
  },

  setAvailabilityFilter(mode) {
    this.state.filters.availability = (this.state.filters.availability === mode) ? '' : mode;
    const chip = document.getElementById('filter-availability-chip');
    if (chip) chip.classList.toggle('active', this.state.filters.availability === 'in_stock');
    this.previewFilterResultsCount();
  },

  async loadProducts(options = {}) {
    if (!options.skipUrlSync) {
      this.syncUrlState();
    }
    const container = document.getElementById('product-grid-container');
    const countLabel = document.getElementById('plp-items-count');
    if (container) container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--color-ink-muted);">Loading optical collection…</div>`;

    try {
      const queryParams = { ...this.state.filters };
      if (this.state.category && this.state.category !== 'all') {
        queryParams.category = this.state.category;
      }

      const res = await OptiiAPI.getProducts(queryParams);
      this.state.products = res.products || [];

      if (countLabel) countLabel.textContent = `${res.total || 0} frames`;

      // Update Filter CTA Result Count
      const filterCta = document.getElementById('btn-filter-apply');
      if (filterCta) filterCta.textContent = `(${res.total || 0}) Apply`;

      this.renderProductsGrid();
    } catch (err) {
      console.error('Error loading products:', err);
      if (container) container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--color-ink-muted);">Could not load optical frames. Please try again.</div>`;
    }
  },

  // 5. Rendering: Shapes Strip & Filter Facets
  renderShapesShowcase() {
    const container = document.getElementById('shapes-pills-row');
    if (!container) return;

    const allPill = `
      <button class="shape-pill-card ${!this.state.filters.shape ? 'active' : ''}" onclick="OptiiApp.filterByShape('')">
        <span>All Shapes</span>
      </button>
    `;

    const shapePills = this.state.shapes.map(s => `
      <button class="shape-pill-card ${this.state.filters.shape === s.slug ? 'active' : ''}" onclick="OptiiApp.filterByShape('${s.slug}')">
        ${s.icon_svg}
        <span>${s.name}</span>
      </button>
    `).join('');

    container.innerHTML = allPill + shapePills;
  },

  renderFilterShapes() {
    const container = document.getElementById('filter-shapes-grid');
    if (!container) return;

    container.innerHTML = this.state.shapes.map(s => `
      <div class="filter-shape-chip ${this.state.filters.shape === s.slug ? 'active' : ''}" onclick="OptiiApp.setShapeFilter('${s.slug}')">
        ${s.icon_svg}
        <span class="filter-shape-label">${s.name}</span>
      </div>
    `).join('');
  },

  // 6. Rendering: Product Grid & Cards (Ace & Tate Reference Standards)
  renderProductsGrid() {
    const container = document.getElementById('product-grid-container');
    if (!container) return;

    if (this.state.products.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 5rem 1rem;">
          <h3 style="font-size: 20px; font-weight: 500; margin-bottom: 8px;">No matching optical frames found</h3>
          <p style="color: var(--color-ink-muted); margin-bottom: 1.5rem;">Try adjusting or clearing your filters to see more frames.</p>
          <button class="btn-pill-primary" style="background-color: var(--color-ink); color: #fff;" onclick="OptiiApp.clearFilters()">Clear All Filters</button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.products.map(p => {
      const isWishlisted = this.state.wishlist.includes(p.slug);
      const defaultVariant = p.default_variant || (p.variants && p.variants[0]) || {};
      const activeColor = defaultVariant.color_name || 'Standard';
      const primaryImg = resolveStoreImgSrc(defaultVariant.primary_image, 'images/tortoise_round_front.jpg');
      const hoverImg = resolveStoreImgSrc(defaultVariant.hover_image || defaultVariant.primary_image, 'images/tortoise_round_front.jpg');
      const priceFormatted = `₹${Number(p.display_price_inr).toLocaleString('en-IN')}`;
      const brandName = (p.brand_name || 'Optii Atelier').toUpperCase();
      const dims = `${p.lens_width_mm || 51}-${p.bridge_width_mm || 20}-${p.temple_length_mm || 150} mm`;
      const fitText = p.frame_fit ? ` · ${p.frame_fit} Fit` : '';

      // Swatches HTML
      const swatchesHtml = (p.variants || []).map((v, idx) => `
        <div class="swatch-touch-container ${v.id === defaultVariant.id ? 'active' : ''}" 
             title="${v.color_name}"
             onclick="event.stopPropagation(); OptiiApp.selectCardColor(${p.id}, ${v.id})">
          <div class="swatch-circle-dot" style="background-color: ${v.color_hex};"></div>
        </div>
      `).join('');

      return `
        <div class="product-card" id="product-card-${p.id}" onclick="OptiiApp.openProductDetail('${p.slug}')">
          <div class="product-card-media">
            <img class="product-img-studio" id="card-img-studio-${p.id}" src="${primaryImg}" alt="${p.name}" loading="lazy" />
            <img class="product-img-model" id="card-img-model-${p.id}" src="${hoverImg}" alt="${p.name} on model" loading="lazy" />
            
            <button class="product-wishlist-btn ${isWishlisted ? 'active' : ''}" 
                    aria-label="Save to Wishlist"
                    onclick="event.stopPropagation(); OptiiApp.toggleWishlist('${p.slug}')">
              <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>

            ${p.is_featured ? `<span class="product-card-badge">Bestseller</span>` : ''}
          </div>

          <div class="product-card-info">
            <div class="product-card-meta-top">
              <span class="product-brand-tag">${brandName}</span>
              <span class="product-dimension-tag">${dims}</span>
            </div>
            <div class="product-card-header">
              <h5 class="product-title">${p.name}</h5>
              <div class="product-price">${priceFormatted}</div>
            </div>
            <div class="product-color-label" id="card-color-label-${p.id}">${activeColor}${fitText}</div>
            <div class="product-swatches-row">${swatchesHtml}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 7. Interactive Swatch Re-binding on Card
  selectCardColor(productId, variantId) {
    const product = this.state.products.find(p => p.id === productId);
    if (!product || !product.variants) return;

    const variant = product.variants.find(v => v.id === variantId);
    if (!variant) return;

    // Update active swatch ring
    const card = document.getElementById(`product-card-${productId}`);
    if (card) {
      card.querySelectorAll('.swatch-touch-container').forEach(el => el.classList.remove('active'));
      const activeEl = event.currentTarget;
      if (activeEl) activeEl.classList.add('active');

      // Update image sources immediately
      const studioImg = card.querySelector(`#card-img-studio-${productId}`);
      const modelImg = card.querySelector(`#card-img-model-${productId}`);
      const colorLabel = card.querySelector(`#card-color-label-${productId}`);

      if (studioImg) studioImg.src = resolveStoreImgSrc(variant.primary_image, 'images/tortoise_round_front.jpg');
      if (modelImg) modelImg.src = resolveStoreImgSrc(variant.hover_image || variant.primary_image, 'images/tortoise_round_front.jpg');
      if (colorLabel) colorLabel.textContent = variant.color_name;
    }
  },

  // 8. Filtering & Sorting Logic
  filterByShape(shapeSlug) {
    this.state.filters.shape = shapeSlug;
    this.renderShapesShowcase();
    this.renderFilterShapes();
    this.loadProducts();
  },

  setShapeFilter(shapeSlug) {
    this.state.filters.shape = (this.state.filters.shape === shapeSlug) ? '' : shapeSlug;
    this.renderFilterShapes();
    this.renderShapesShowcase();
    this.previewFilterResultsCount();
  },

  setFitFilter(fit) {
    this.state.filters.fit = (this.state.filters.fit === fit) ? '' : fit;
    document.querySelectorAll('.filter-fit-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.fit === this.state.filters.fit);
    });
    this.previewFilterResultsCount();
  },

  setMaterialFilter(material) {
    this.state.filters.material = (this.state.filters.material === material) ? '' : material;
    document.querySelectorAll('.filter-mat-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.mat === this.state.filters.material);
    });
    this.previewFilterResultsCount();
  },

  setGenderFilter(gender) {
    this.state.filters.gender = (this.state.filters.gender === gender) ? '' : gender;
    document.querySelectorAll('.filter-gender-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.gender === this.state.filters.gender);
    });
    this.previewFilterResultsCount();
  },

  setPriceFilter(min, max) {
    this.state.filters.min_price = min;
    this.state.filters.max_price = max;
    document.querySelectorAll('.filter-price-chip').forEach(c => {
      const match = c.dataset.min === String(min) && c.dataset.max === String(max);
      c.classList.toggle('active', match);
    });
    this.previewFilterResultsCount();
  },

  async previewFilterResultsCount() {
    try {
      const res = await OptiiAPI.getProducts(this.state.filters);
      const applyBtn = document.getElementById('btn-filter-apply');
      if (applyBtn) applyBtn.textContent = `(${res.total || 0}) Apply`;
    } catch (_) {}
  },

  clearFilters() {
    this.state.filters = {
      shape: '',
      brand: '',
      gender: '',
      fit: '',
      material: '',
      color: '',
      availability: '',
      min_price: '',
      max_price: '',
      sort: 'default',
      search: ''
    };
    document.querySelectorAll('.filter-shape-chip, .filter-pill-chip').forEach(el => el.classList.remove('active'));
    this.renderShapesShowcase();
    this.renderFilterBrands();
    this.toggleFilterDrawer(false);
    this.loadProducts();
  },

  // 9. Wishlist Management
  toggleWishlist(slug) {
    const idx = this.state.wishlist.indexOf(slug);
    if (idx > -1) {
      this.state.wishlist.splice(idx, 1);
    } else {
      this.state.wishlist.push(slug);
    }
    localStorage.setItem('optii_wishlist', JSON.stringify(this.state.wishlist));
    this.updateBadges();
    this.renderProductsGrid();
  },

  updateBadges() {
    const wishlistBadge = document.getElementById('wishlist-badge');
    const cartBadge = document.getElementById('cart-badge');

    if (wishlistBadge) {
      wishlistBadge.textContent = this.state.wishlist.length;
      wishlistBadge.style.display = this.state.wishlist.length > 0 ? 'flex' : 'none';
    }
    if (cartBadge) {
      cartBadge.textContent = this.state.cart.length;
      cartBadge.style.display = this.state.cart.length > 0 ? 'flex' : 'none';
    }
  },

  // 10. Interactive Search Modal
  async handleSearchInput(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      this.renderSearchResults([]);
      return;
    }

    try {
      const res = await OptiiAPI.getProducts({ search: q, limit: 8 });
      this.renderSearchResults(res.products || []);
    } catch (_) {}
  },

  renderSearchResults(results) {
    const container = document.getElementById('search-modal-results');
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--color-ink-muted);">Type to search frames, brands, or materials…</div>`;
      return;
    }

    container.innerHTML = results.map(p => `
      <div class="search-result-item" onclick="OptiiApp.toggleSearchModal(false); OptiiApp.openProductDetail('${p.slug}')">
        <img class="search-result-thumb" src="${(p.default_variant && p.default_variant.primary_image) || 'images/tortoise_round_front.jpg'}" alt="${p.name}" />
        <div class="search-result-info">
          <div class="search-result-title">${p.name}</div>
          <div class="search-result-meta">${p.brand_name} · ${p.shape_name} · ₹${Number(p.base_price_inr).toLocaleString('en-IN')}</div>
        </div>
      </div>
    `).join('');
  },

  // 11. Shopping Bag / Cart Drawer Rendering
  renderCart() {
    if (window.OptiiCart) {
      OptiiCart.render();
    }
  },

  removeFromCart(index) {
    if (window.OptiiCart) {
      OptiiCart.removeItem(index);
    }
  },

  // 12. Wishlist Drawer Rendering
  async renderWishlist() {
    const container = document.getElementById('wishlist-drawer-items');
    if (!container) return;

    if (this.state.wishlist.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 4rem 1rem; color: var(--color-ink-muted);">You have no saved frames yet. Click the heart icon on any frame to save it here.</div>`;
      return;
    }

    const savedFrames = this.state.products.filter(p => this.state.wishlist.includes(p.slug));
    container.innerHTML = savedFrames.map(p => `
      <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border); align-items: center;">
        <img style="width: 60px; height: 60px; object-fit: contain; background: var(--color-surface-subtle);" src="${(p.default_variant && p.default_variant.primary_image) || 'images/tortoise_round_front.jpg'}" alt="${p.name}" />
        <div style="flex: 1;">
          <div style="font-weight: 500;">${p.name}</div>
          <div style="font-size: 13px; color: var(--color-ink-muted);">₹${Number(p.base_price_inr).toLocaleString('en-IN')}</div>
        </div>
        <button class="btn-pill-primary" style="padding: 6px 14px; font-size: 12px;" onclick="OptiiApp.toggleWishlistDrawer(false); OptiiApp.openProductDetail('${p.slug}')">View Frame</button>
      </div>
    `).join('');
  },

  // 13. Product Detail Page Navigation Trigger
  openProductDetail(slug) {
    window.location.href = `/product/${slug}`;
  },

  closeProductDetail() {
    const modal = document.getElementById('quick-pdp-modal');
    if (modal) modal.classList.remove('active');
  },

  // 14. Quick Add To Cart from PDP
  addCurrentToCart() {
    if (!this.state.currentProduct || !this.state.selectedVariant) return;

    const item = {
      product_id: this.state.currentProduct.id,
      variant_id: this.state.selectedVariant.id,
      name: this.state.currentProduct.name,
      sku: this.state.selectedVariant.sku,
      color_name: this.state.selectedVariant.color_name,
      price_inr: this.state.currentProduct.base_price_inr,
      total_price_inr: this.state.currentProduct.base_price_inr,
      image_url: this.state.selectedVariant.primary_image
    };

    this.state.cart.push(item);
    localStorage.setItem('optii_cart', JSON.stringify(this.state.cart));
    this.updateBadges();
    this.closeProductDetail();
    this.toggleCartDrawer(true);
  },

  // 15. WhatsApp Order Inquiry
  async inquireOnWhatsApp() {
    if (!this.state.currentProduct || !this.state.selectedVariant) return;

    try {
      const payload = {
        product_id: this.state.currentProduct.id,
        variant_id: this.state.selectedVariant.id,
        product_name: this.state.currentProduct.name,
        sku: this.state.selectedVariant.sku,
        color_name: this.state.selectedVariant.color_name,
        dimensions: this.state.currentProduct.dimensions ? this.state.currentProduct.dimensions.display_string : '',
        total_price_inr: this.state.currentProduct.base_price_inr
      };

      const res = await OptiiAPI.createWhatsAppEnquiry(payload);
      if (res.whatsapp_url) {
        window.open(res.whatsapp_url, '_blank');
      }
    } catch (err) {
      console.error('WhatsApp inquiry error:', err);
    }
  },

  // 16. In-Store Eye Test Booking Dialog
  async openAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    if (modal) {
      modal.classList.add('active');
      const dateInput = document.getElementById('appointment-date-input');
      if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.toISOString().split('T')[0];
        this.loadAppointmentSlots(dateInput.value);
      }
    }
  },

  closeAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    if (modal) modal.classList.remove('active');
  },

  async loadAppointmentSlots(dateStr) {
    const container = document.getElementById('appointment-slots-container');
    if (!container) return;

    container.innerHTML = '<span style="font-size: 12px; color: var(--color-ink-muted);">Calculating available optometrist slots…</span>';

    try {
      const res = await OptiiAPI.getAvailableSlots(1, dateStr);
      if (!res.slots || res.slots.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--color-ink-muted);">No available slots for this date. Store is closed.</span>';
        return;
      }

      container.innerHTML = res.slots.map(s => `
        <button type="button" 
                class="slot-pill ${!s.is_available ? 'disabled' : ''}" 
                ${!s.is_available ? 'disabled' : ''}
                onclick="OptiiApp.selectSlot('${s.start_time}', this)">
          ${s.display_label}
        </button>
      `).join('');
    } catch (_) {
      container.innerHTML = '<span style="font-size: 12px; color: #ef4444;">Error loading slots.</span>';
    }
  },

  selectSlot(startTime, el) {
    document.querySelectorAll('.slot-pill').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    this.state.selectedSlot = startTime;
  },

  async submitAppointment(e) {
    e.preventDefault();
    const name = document.getElementById('app-name').value.trim();
    const phone = document.getElementById('app-phone').value.trim();
    const email = document.getElementById('app-email').value.trim();
    const date = document.getElementById('appointment-date-input').value;
    const time = this.state.selectedSlot;

    if (!name || !phone || !date || !time) {
      alert('Please fill in your name, mobile number, and select an available time slot.');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying Slot & Reserving…';
    }

    try {
      const res = await OptiiAPI.bookAppointment({
        store_id: 1,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        appointment_date: date,
        start_time: time
      });

      // Show rich confirmation screen inside modal
      const modalBox = document.querySelector('#appointment-modal .modal-box-card');
      if (modalBox) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const storeCfg = window.__OPTII_STORE_SETTINGS__?.store || {};
        const storeName = storeCfg.name || res.appointment.store_name || 'Vision Opticals';
        const businessWa = String(storeCfg.whatsapp_number || storeCfg.phone || '919486552324').replace(/[^0-9]/g, '');
        const waText = encodeURIComponent(
          `*${storeName} — Eye Test Appointment Confirmation*\n` +
          `• Appointment: ${res.appointment.appointment_number}\n` +
          `• Date & Time: ${date} at ${time}\n` +
          `• Patient: ${name} (${cleanPhone})\n` +
          `• Clinic: ${res.appointment.store_name} (${res.appointment.store_address})\n` +
          `_Hello ${storeName} Optometrist, I have booked an in-store eye test appointment._`
        );
        const waUrl = `https://wa.me/${businessWa}?text=${waText}`;

        modalBox.innerHTML = `
          <div class="drawer-header">
            <span class="drawer-title">Appointment Confirmed</span>
            <button class="drawer-close-btn" onclick="OptiiApp.closeAppointmentModal()" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style="padding: 2rem 1.5rem; text-align: center;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #ecfdf5; color: #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 6px;">Eye Test Reserved</h3>
            <p style="font-size: 13px; color: var(--color-ink-secondary); margin-bottom: 12px;">Your computerized vision consultation has been locked in our schedule.</p>
            <div style="background: var(--color-surface-subtle); display: inline-block; padding: 4px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 1.25rem;">
              Reference: ${res.appointment.appointment_number}
            </div>

            <div style="background: #fff; border: 1px solid var(--color-border); padding: 14px; text-align: left; font-size: 13px; margin-bottom: 1.5rem; border-radius: 4px;">
              <div><strong>Patient:</strong> ${name} · +91 ${cleanPhone}</div>
              <div style="margin-top: 4px;"><strong>Date & Slot:</strong> ${date} at ${time} (30 mins)</div>
              <div style="margin-top: 4px;"><strong>Location:</strong> ${res.appointment.store_name}</div>
              <div style="color: var(--color-ink-muted); font-size: 12px; margin-top: 2px;">${res.appointment.store_address}</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <a href="${waUrl}" target="_blank" class="btn-pill-primary" style="background: #25D366; color: #fff; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; height: 42px; font-size: 13px; font-weight: 600;">
                Save Booking Reminder on WhatsApp
              </a>
              <button type="button" class="btn-pill-secondary" style="border: 1px solid var(--color-border); background: #fff; color: var(--color-ink); height: 40px; font-size: 13px; font-weight: 600; cursor: pointer;" onclick="OptiiApp.closeAppointmentModal()">
                Done
              </button>
            </div>
          </div>
        `;
      }
    } catch (err) {
      console.error('Booking Error:', err);
      if (err.message && (err.message.includes('already been reserved') || err.message.includes('SLOT_ALREADY_BOOKED'))) {
        alert('⚠️ This appointment slot has just been reserved by another patient. We have refreshed the schedule for you — please select another available slot.');
        this.loadAppointmentSlots(date);
      } else {
        alert(err.message || 'Error booking appointment. Please try again.');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm Booking';
      }
    }
  }
};

window.OptiiApp = OptiiApp;
document.addEventListener('DOMContentLoaded', () => OptiiApp.init());
