/**
 * Optii Product Detail Page (PDP) & 4-Step Advanced Lens Configurator Controller
 * Inspired by Ace & Tate European Optical Retail Standards
 */

const OptiiPDP = {
  state: {
    slug: 'henry-round-acetate',
    product: null,
    selectedVariant: null,
    selectedImageIndex: 0,
    lenses: {
      usages: [],
      thicknesses: [],
      coatings: []
    },
    configurator: {
      isOpen: false,
      currentStep: 1,
      usage: null,
      prescription: {
        method: 'upload', // 'upload' | 'manual' | 'later'
        token: null,
        filename: null,
        manual: {
          od_sph: '-1.50',
          od_cyl: '0.00',
          od_axis: '',
          od_add: '',
          os_sph: '-1.75',
          os_cyl: '0.00',
          os_axis: '',
          os_add: '',
          pd_type: 'single',
          pd_single: '63',
          pd_right: '31.5',
          pd_left: '31.5'
        }
      },
      thickness: null,
      coating: null,
      pricing: {
        frame_base_inr: 0,
        lens_usage_inr: 0,
        lens_thickness_inr: 0,
        lens_coating_inr: 0,
        total_lenses_inr: 0,
        grand_total_inr: 0
      }
    },
    cart: JSON.parse(localStorage.getItem('optii_cart') || '[]'),
    wishlist: JSON.parse(localStorage.getItem('optii_wishlist') || '[]')
  },

  // 1. Initialization
  async init() {
    console.log('[Optii PDP] Initializing product detail view...');
    
    // Parse slug from URL: /product/:slug or ?slug=...
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const slugIndex = pathParts.indexOf('product');
    if (slugIndex !== -1 && pathParts[slugIndex + 1]) {
      this.state.slug = pathParts[slugIndex + 1];
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('slug')) {
        this.state.slug = urlParams.get('slug');
      }
    }

    this.bindGlobalEvents();
    this.updateBadges();

    try {
      await Promise.all([
        this.loadProduct(this.state.slug),
        this.loadLensHierarchy()
      ]);
      this.trackRecentlyViewed();
    } catch (err) {
      console.error('[Optii PDP Init Error]:', err);
    }
  },

  // 2. Load Product Details from API
  async loadProduct(slug) {
    try {
      const res = await OptiiAPI.getProduct(slug);
      if (!res || !res.success || !res.product) {
        document.getElementById('pdp-main-content').innerHTML = `
          <div style="text-align: center; padding: 6rem 1rem;">
            <h2>Optical Frame Not Found</h2>
            <p style="color: var(--color-ink-muted); margin: 1rem 0 2rem;">The requested frame silhouette could not be located in our atelier collection.</p>
            <a href="/" class="btn-pill-primary" style="background: #000; color: #fff;">Return to Collections</a>
          </div>
        `;
        return;
      }

      this.state.product = res.product;
      this.state.selectedVariant = res.product.variants.find(v => v.is_default) || res.product.variants[0];
      this.renderProduct();
    } catch (err) {
      console.error('Failed to load product payload:', err);
    }
  },

  // 3. Load Lens Options (Steps 1, 3, 4)
  async loadLensHierarchy() {
    try {
      const res = await OptiiAPI.getLenses();
      if (res && res.success && res.steps) {
        this.state.lenses.usages = res.steps.step1_usages || [];
        this.state.lenses.thicknesses = res.steps.step3_thicknesses || [];
        this.state.lenses.coatings = res.steps.step4_coatings || [];
      }
    } catch (err) {
      console.error('Failed to load lens tiers:', err);
    }
  },

  // 4. Render Product Details
  renderProduct() {
    const p = this.state.product;
    const v = this.state.selectedVariant;
    if (!p || !v) return;

    // Document Title
    document.title = `${p.name} — Optii Optical Atelier`;

    // Breadcrumbs
    const bc = document.getElementById('pdp-breadcrumbs-container');
    if (bc) {
      bc.innerHTML = `
        <a href="/">Home</a>
        <span class="divider">/</span>
        <a href="/#${p.category_slug || 'glasses'}">${p.category_name || 'Eyeglasses'}</a>
        <span class="divider">/</span>
        <span>${p.name}</span>
      `;
    }

    // Render Multi-Image Gallery
    this.renderGallery();

    // Product Title & Brand
    const brandEl = document.getElementById('pdp-brand');
    const titleEl = document.getElementById('pdp-title');
    const priceEl = document.getElementById('pdp-price');
    const mobilePriceEl = document.getElementById('pdp-mobile-price-val');
    const mobileColorEl = document.getElementById('pdp-mobile-color-val');

    if (brandEl) brandEl.textContent = (p.brand_name || 'Optii Atelier').toUpperCase();
    if (titleEl) titleEl.textContent = p.name;
    
    const formattedPrice = `₹${Number(v.price_override_inr || p.base_price_inr).toLocaleString('en-IN')}`;
    if (priceEl) priceEl.textContent = formattedPrice;
    if (mobilePriceEl) mobilePriceEl.textContent = formattedPrice;
    if (mobileColorEl) mobileColorEl.textContent = v.color_name;

    // Render Swatches
    const swatchesWrap = document.getElementById('pdp-swatches-grid');
    const curColorLabel = document.getElementById('pdp-current-color-name');
    if (curColorLabel) curColorLabel.textContent = v.color_name;

    if (swatchesWrap) {
      swatchesWrap.innerHTML = p.variants.map(variant => `
        <button class="pdp-swatch-btn ${variant.id === v.id ? 'active' : ''}" 
                title="${variant.color_name}"
                onclick="OptiiPDP.selectVariant(${variant.id})">
          <div class="pdp-swatch-dot" style="background-color: ${variant.color_hex};"></div>
        </button>
      `).join('');
    }

    // Optical Dimensions Schematic Card
    const dimLens = document.getElementById('dim-lens-width');
    const dimBridge = document.getElementById('dim-bridge-width');
    const dimTemple = document.getElementById('dim-temple-length');
    const dimHeight = document.getElementById('dim-frame-height');
    const dimFit = document.getElementById('dim-fit-badge');

    if (dimLens) dimLens.textContent = `${p.lens_width_mm || 51} mm`;
    if (dimBridge) dimBridge.textContent = `${p.bridge_width_mm || 20} mm`;
    if (dimTemple) dimTemple.textContent = `${p.temple_length_mm || 150} mm`;
    if (dimHeight) dimHeight.textContent = `${p.frame_height_mm || 46} mm`;
    if (dimFit) dimFit.textContent = `${p.frame_fit || 'Medium'} Fit`;

    // Descriptions & Materials
    const descEl = document.getElementById('pdp-description-text');
    const matEl = document.getElementById('pdp-material-spec');
    if (descEl) descEl.textContent = p.description || 'Bespoke optical frame crafted with precision German barrel hinges and Italian cellulose bio-acetate.';
    if (matEl) matEl.textContent = `${p.material || 'Italian Bio-Acetate'} · Hand-polished with diamond-paste buffing.`;

    // Wishlist Button State
    this.updateWishlistBtn();

    // Related Products
    this.renderRelatedProducts();
  },

  // 5. Render Multi-Image Gallery
  renderGallery() {
    const galleryGrid = document.getElementById('pdp-gallery-grid');
    const v = this.state.selectedVariant;
    if (!galleryGrid || !v) return;

    const images = (v.images && v.images.length > 0) ? v.images : [
      { image_url: v.primary_image || 'images/tortoise_round_front.jpg', image_type: 'studio_front' },
      { image_url: v.hover_image || 'images/tortoise_round_angle.jpg', image_type: 'model_on_face' }
    ];

    galleryGrid.innerHTML = images.map((img, idx) => `
      <div class="pdp-gallery-item ${idx === 0 ? 'featured-hero' : ''}" onclick="OptiiPDP.openZoomModal(${idx})">
        <img src="/${img.image_url}" alt="${this.state.product.name} — ${img.image_type}" loading="${idx === 0 ? 'eager' : 'lazy'}" />
        <div class="pdp-zoom-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </div>
      </div>
    `).join('');
  },

  // 6. Select Colorway Variant
  selectVariant(variantId) {
    const variant = this.state.product.variants.find(v => v.id === variantId);
    if (!variant) return;

    this.state.selectedVariant = variant;
    this.renderProduct();
  },

  // 7. Fullscreen Zoom Modal
  openZoomModal(imageIndex = 0) {
    const v = this.state.selectedVariant;
    if (!v) return;

    const images = v.images && v.images.length ? v.images : [{ image_url: v.primary_image }];
    const targetImg = images[imageIndex] || images[0];

    const modal = document.getElementById('fullscreen-zoom-modal');
    const imgEl = document.getElementById('fullscreen-zoom-img');

    if (modal && imgEl) {
      imgEl.src = `/${targetImg.image_url}`;
      modal.classList.add('active');
    }
  },

  closeZoomModal() {
    const modal = document.getElementById('fullscreen-zoom-modal');
    if (modal) modal.classList.remove('active');
  },

  // 8. Related Products
  renderRelatedProducts() {
    const container = document.getElementById('pdp-related-grid');
    const related = this.state.product && this.state.product.related_products;
    if (!container || !related || related.length === 0) return;

    container.innerHTML = related.map(rel => {
      const priceFormatted = `₹${Number(rel.base_price_inr).toLocaleString('en-IN')}`;
      const dims = `${rel.lens_width_mm || 51}-${rel.bridge_width_mm || 20}-${rel.temple_length_mm || 150} mm`;
      return `
        <div class="product-card" onclick="window.location.href='/product/${rel.slug}'">
          <div class="product-card-media">
            <img class="product-img-studio" src="/${rel.primary_image}" alt="${rel.name}" loading="lazy" />
          </div>
          <div class="product-card-info">
            <div class="product-card-meta-top">
              <span class="product-brand-tag">${(rel.brand_name || 'Optii Atelier').toUpperCase()}</span>
              <span class="product-dimension-tag">${dims}</span>
            </div>
            <div class="product-card-header">
              <h5 class="product-title">${rel.name}</h5>
              <div class="product-price">${priceFormatted}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 9. Track Recently Viewed
  trackRecentlyViewed() {
    if (!this.state.product) return;
    try {
      let recent = JSON.parse(localStorage.getItem('optii_recently_viewed') || '[]');
      recent = recent.filter(item => item.slug !== this.state.product.slug);
      recent.unshift({
        name: this.state.product.name,
        slug: this.state.product.slug,
        brand_name: this.state.product.brand_name,
        price_inr: this.state.product.base_price_inr,
        image_url: this.state.selectedVariant.primary_image
      });
      localStorage.setItem('optii_recently_viewed', JSON.stringify(recent.slice(0, 6)));
    } catch (e) {}
  },

  // ─── FOUR-STEP ADVANCED LENS CONFIGURATOR ───

  openConfigurator() {
    this.state.configurator.isOpen = true;
    this.state.configurator.currentStep = 1;
    
    // Set default usage if not selected
    if (!this.state.configurator.usage && this.state.lenses.usages.length > 0) {
      this.state.configurator.usage = this.state.lenses.usages[0];
    }
    // Set default thickness (1.50 Standard)
    if (!this.state.configurator.thickness && this.state.lenses.thicknesses.length > 0) {
      this.state.configurator.thickness = this.state.lenses.thicknesses[0];
    }
    // Set default coating (Anti-Reflective)
    if (!this.state.configurator.coating && this.state.lenses.coatings.length > 0) {
      this.state.configurator.coating = this.state.lenses.coatings[0];
    }

    const modal = document.getElementById('configurator-modal');
    if (modal) modal.classList.add('active');

    this.renderConfiguratorStep();
    this.calculatePricing();
  },

  closeConfigurator() {
    this.state.configurator.isOpen = false;
    const modal = document.getElementById('configurator-modal');
    if (modal) modal.classList.remove('active');
  },

  goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return;
    
    // If navigating from step 2, validate prescription
    if (this.state.configurator.currentStep === 2 && stepNumber > 2) {
      if (!this.validateStep2Prescription()) return;
    }

    this.state.configurator.currentStep = stepNumber;
    this.renderConfiguratorStep();
  },

  renderConfiguratorStep() {
    const step = this.state.configurator.currentStep;

    // Update Progress Bar
    document.querySelectorAll('.step-indicator').forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === step);
      el.classList.toggle('completed', s < step);
    });

    // Toggle Step Panes
    document.querySelectorAll('.config-step-pane').forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === step);
    });

    // Render Step specific content
    if (step === 1) this.renderStep1Usage();
    if (step === 2) this.renderStep2Prescription();
    if (step === 3) this.renderStep3Thickness();
    if (step === 4) this.renderStep4Coatings();

    // Footer Next / Finish Button
    const btnNext = document.getElementById('btn-config-next');
    if (btnNext) {
      if (step === 4) {
        btnNext.textContent = 'Add to Bag';
        btnNext.onclick = () => this.addConfiguredToCart();
      } else {
        btnNext.textContent = 'Continue →';
        btnNext.onclick = () => this.goToStep(step + 1);
      }
    }

    const btnBack = document.getElementById('btn-config-back');
    if (btnBack) {
      btnBack.style.visibility = step === 1 ? 'hidden' : 'visible';
    }
  },

  // Step 1: Render Usages
  renderStep1Usage() {
    const grid = document.getElementById('config-usages-grid');
    if (!grid) return;

    const usages = this.state.lenses.usages;
    grid.innerHTML = usages.map(u => {
      const isSelected = this.state.configurator.usage && this.state.configurator.usage.id === u.id;
      const priceText = u.base_price_inr > 0 ? `+₹${Number(u.base_price_inr).toLocaleString('en-IN')}` : 'Included';
      return `
        <div class="lens-option-card ${isSelected ? 'selected' : ''}" onclick="OptiiPDP.selectUsage(${u.id})">
          <div class="lens-card-title-row">
            <div class="lens-card-title">${u.name}</div>
            <div class="lens-card-price">${priceText}</div>
          </div>
          <p class="lens-card-desc">${u.description}</p>
        </div>
      `;
    }).join('');
  },

  selectUsage(usageId) {
    const u = this.state.lenses.usages.find(item => item.id === usageId);
    if (!u) return;

    this.state.configurator.usage = u;
    this.renderStep1Usage();
    this.calculatePricing();
  },

  // Step 2: Render Prescription Entry
  renderStep2Prescription() {
    // Show/hide ADD column in manual table based on Progressive selection
    const isProgressive = this.state.configurator.usage && this.state.configurator.usage.slug.includes('progressive');
    const addHeaders = document.querySelectorAll('.rx-add-col');
    addHeaders.forEach(el => el.style.display = isProgressive ? 'table-cell' : 'none');

    this.updateRxTabs();
  },

  switchRxMethod(method) {
    this.state.configurator.prescription.method = method;
    this.updateRxTabs();
  },

  updateRxTabs() {
    const method = this.state.configurator.prescription.method;
    document.querySelectorAll('.rx-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === method);
    });

    const paneUpload = document.getElementById('rx-pane-upload');
    const paneManual = document.getElementById('rx-pane-manual');
    const paneLater = document.getElementById('rx-pane-later');

    if (paneUpload) paneUpload.style.display = method === 'upload' ? 'block' : 'none';
    if (paneManual) paneManual.style.display = method === 'manual' ? 'block' : 'none';
    if (paneLater) paneLater.style.display = method === 'later' ? 'block' : 'none';
  },

  async handlePrescriptionUpload(file) {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      alert('Invalid file format. Please upload a clear photo or PDF (JPG, PNG, WEBP, PDF).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Prescription file size exceeds the 5MB limit.');
      return;
    }

    const dropzone = document.getElementById('rx-dropzone');
    const statusBox = document.getElementById('rx-upload-status');
    if (statusBox) statusBox.innerHTML = 'Uploading and securing optical document...';

    const formData = new FormData();
    formData.append('prescription', file);

    try {
      const res = await fetch('/api/prescriptions/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.prescription_token) {
        this.state.configurator.prescription.token = data.prescription_token;
        this.state.configurator.prescription.filename = data.original_filename;

        if (statusBox) {
          statusBox.innerHTML = `
            <div class="rx-uploaded-card">
              <div>
                <strong>✓ Document Secured:</strong> ${data.original_filename} (${Math.round(data.file_size / 1024)} KB)
              </div>
              <button type="button" onclick="OptiiPDP.removeUploadedPrescription()" style="font-size: 12px; color: #dc2626; text-decoration: underline;">
                Remove
              </button>
            </div>
          `;
        }
      } else {
        alert(data.message || 'Prescription upload failed. Please try again.');
        if (statusBox) statusBox.innerHTML = '';
      }
    } catch (err) {
      console.error('Rx Upload Error:', err);
      alert('Prescription upload encountered a network error.');
      if (statusBox) statusBox.innerHTML = '';
    }
  },

  removeUploadedPrescription() {
    this.state.configurator.prescription.token = null;
    this.state.configurator.prescription.filename = null;
    const statusBox = document.getElementById('rx-upload-status');
    if (statusBox) statusBox.innerHTML = '';
    const fileInput = document.getElementById('rx-file-input');
    if (fileInput) fileInput.value = '';
  },

  validateStep2Prescription() {
    const rx = this.state.configurator.prescription;
    
    // If zero power fashion frame, skip validation
    if (this.state.configurator.usage && this.state.configurator.usage.slug === 'fashion-zero-power') {
      return true;
    }

    if (rx.method === 'upload') {
      if (!rx.token) {
        alert('Please upload your prescription document or switch to manual input / provide later.');
        return false;
      }
      return true;
    }

    if (rx.method === 'manual') {
      // Validate Cylinder requires Axis
      const odCyl = parseFloat(document.getElementById('rx-od-cyl')?.value || 0);
      const odAxis = document.getElementById('rx-od-axis')?.value;
      const osCyl = parseFloat(document.getElementById('rx-os-cyl')?.value || 0);
      const osAxis = document.getElementById('rx-os-axis')?.value;

      if (odCyl !== 0 && (!odAxis || isNaN(odAxis) || odAxis < 1 || odAxis > 180)) {
        alert('Right Eye (OD) Cylinder requires an Axis between 1° and 180°.');
        return false;
      }
      if (osCyl !== 0 && (!osAxis || isNaN(osAxis) || osAxis < 1 || osAxis > 180)) {
        alert('Left Eye (OS) Cylinder requires an Axis between 1° and 180°.');
        return false;
      }

      // Record manual parameters
      rx.manual.od_sph = document.getElementById('rx-od-sph')?.value || '0.00';
      rx.manual.od_cyl = document.getElementById('rx-od-cyl')?.value || '0.00';
      rx.manual.od_axis = odAxis;
      rx.manual.os_sph = document.getElementById('rx-os-sph')?.value || '0.00';
      rx.manual.os_cyl = document.getElementById('rx-os-cyl')?.value || '0.00';
      rx.manual.os_axis = osAxis;
      rx.manual.pd_single = document.getElementById('rx-pd-single')?.value || '63';
      return true;
    }

    return true; // 'later'
  },

  // Step 3: Render Lens Thickness
  renderStep3Thickness() {
    const grid = document.getElementById('config-thickness-grid');
    if (!grid) return;

    // Smart recommendations based on entered SPH
    const sph = Math.min(
      Math.abs(parseFloat(this.state.configurator.prescription.manual.od_sph || 0)),
      Math.abs(parseFloat(this.state.configurator.prescription.manual.os_sph || 0))
    );

    const thicknesses = this.state.lenses.thicknesses;
    grid.innerHTML = thicknesses.map(t => {
      const isSelected = this.state.configurator.thickness && this.state.configurator.thickness.id === t.id;
      const priceText = t.price_inr > 0 ? `+₹${Number(t.price_inr).toLocaleString('en-IN')}` : 'Included';
      
      // Determine smart badge without claiming medical cert
      let isRecommended = false;
      if (sph < 2.25 && t.index_rating === 1.50) isRecommended = true;
      else if (sph >= 2.25 && sph < 4.25 && t.index_rating === 1.60) isRecommended = true;
      else if (sph >= 4.25 && sph < 6.50 && t.index_rating === 1.67) isRecommended = true;
      else if (sph >= 6.50 && t.index_rating === 1.74) isRecommended = true;

      return `
        <div class="lens-option-card ${isSelected ? 'selected' : ''}" onclick="OptiiPDP.selectThickness(${t.id})">
          <div class="lens-card-title-row">
            <div>
              <div class="lens-card-title">${t.name}</div>
              ${isRecommended ? `<span class="lens-card-rec-badge">Recommended for your power</span>` : ''}
            </div>
            <div class="lens-card-price">${priceText}</div>
          </div>
          <p class="lens-card-desc">${t.description}</p>
        </div>
      `;
    }).join('');
  },

  selectThickness(thicknessId) {
    const t = this.state.lenses.thicknesses.find(item => item.id === thicknessId);
    if (!t) return;

    this.state.configurator.thickness = t;
    this.renderStep3Thickness();
    this.calculatePricing();
  },

  // Step 4: Render Coatings
  renderStep4Coatings() {
    const grid = document.getElementById('config-coatings-grid');
    if (!grid) return;

    const coatings = this.state.lenses.coatings;
    grid.innerHTML = coatings.map(c => {
      const isSelected = this.state.configurator.coating && this.state.configurator.coating.id === c.id;
      const priceText = c.price_inr > 0 ? `+₹${Number(c.price_inr).toLocaleString('en-IN')}` : 'Included';
      return `
        <div class="lens-option-card ${isSelected ? 'selected' : ''}" onclick="OptiiPDP.selectCoating(${c.id})">
          <div class="lens-card-title-row">
            <div class="lens-card-title">${c.name}</div>
            <div class="lens-card-price">${priceText}</div>
          </div>
          <p class="lens-card-desc">${c.description}</p>
        </div>
      `;
    }).join('');
  },

  selectCoating(coatingId) {
    const c = this.state.lenses.coatings.find(item => item.id === coatingId);
    if (!c) return;

    this.state.configurator.coating = c;
    this.renderStep4Coatings();
    this.calculatePricing();
  },

  // Live Optical Pricing Calculation
  async calculatePricing() {
    const v = this.state.selectedVariant || (this.state.product && this.state.product.variants[0]);
    const framePrice = v ? (v.price_override_inr || this.state.product.base_price_inr) : 0;
    const usageId = this.state.configurator.usage ? this.state.configurator.usage.id : null;
    const thicknessId = this.state.configurator.thickness ? this.state.configurator.thickness.id : null;
    const coatingId = this.state.configurator.coating ? this.state.configurator.coating.id : null;

    try {
      const res = await OptiiAPI.calculateLensPrice({
        frame_price_inr: framePrice,
        usage_id: usageId,
        thickness_id: thicknessId,
        coating_id: coatingId
      });

      if (res && res.success && res.calculation) {
        this.state.configurator.pricing = res.calculation;
        
        // Update footer UI
        const totalEl = document.getElementById('config-total-price-val');
        const breakdownEl = document.getElementById('config-price-breakdown-text');

        if (totalEl) totalEl.textContent = `₹${Number(res.calculation.grand_total_inr).toLocaleString('en-IN')}`;
        if (breakdownEl) breakdownEl.textContent = res.calculation.summary_text;
      }
    } catch (err) {
      console.error('Calculation Error:', err);
    }
  },

  // Add Configured Product to Bag
  addConfiguredToCart() {
    const p = this.state.product;
    const v = this.state.selectedVariant;
    const cfg = this.state.configurator;

    const cartItem = {
      cart_item_id: 'cart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      product_id: p.id,
      product_name: p.name,
      slug: p.slug,
      brand_name: p.brand_name || 'Optii Atelier',
      variant_id: v.id,
      sku: v.sku,
      color_name: v.color_name,
      image_url: v.primary_image,
      dimensions: p.dimensions ? p.dimensions.display_string : '51-20-150 mm',
      frame_price_inr: v.price_override_inr || p.base_price_inr,
      configured_lenses: {
        usage_name: cfg.usage ? cfg.usage.name : 'Single Vision Distance',
        thickness_name: cfg.thickness ? cfg.thickness.name : 'Standard 1.50 Index',
        coating_name: cfg.coating ? cfg.coating.name : 'Clear Anti-Reflective',
        prescription_method: cfg.prescription.method,
        prescription_token: cfg.prescription.token,
        prescription_filename: cfg.prescription.filename,
        prescription_manual: cfg.prescription.method === 'manual' ? cfg.prescription.manual : null
      },
      item_price_inr: cfg.pricing.grand_total_inr || (v.price_override_inr || p.base_price_inr),
      quantity: 1
    };

    this.closeConfigurator();
    if (window.OptiiCart) {
      OptiiCart.addItem(cartItem);
    } else {
      this.state.cart.push(cartItem);
      localStorage.setItem('optii_cart', JSON.stringify(this.state.cart));
      this.updateBadges();
      this.toggleCartDrawer(true);
    }
  },

  // Add Frame Only to Bag
  addFrameOnlyToCart() {
    const p = this.state.product;
    const v = this.state.selectedVariant;
    const price = v.price_override_inr || p.base_price_inr;

    const cartItem = {
      cart_item_id: 'cart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      product_id: p.id,
      product_name: p.name,
      slug: p.slug,
      brand_name: p.brand_name || 'Optii Atelier',
      variant_id: v.id,
      sku: v.sku,
      color_name: v.color_name,
      image_url: v.primary_image,
      dimensions: p.dimensions ? p.dimensions.display_string : '51-20-150 mm',
      frame_price_inr: price,
      configured_lenses: {
        usage_name: 'Frame Only (Without Lenses)',
        thickness_name: 'Demo Lenses Included',
        coating_name: 'None',
        prescription_method: 'none'
      },
      item_price_inr: price,
      quantity: 1
    };

    if (window.OptiiCart) {
      OptiiCart.addItem(cartItem);
    } else {
      this.state.cart.push(cartItem);
      localStorage.setItem('optii_cart', JSON.stringify(this.state.cart));
      this.updateBadges();
      this.toggleCartDrawer(true);
    }
  },

  // WhatsApp Inquiry
  async inquireOnWhatsApp() {
    const p = this.state.product;
    const v = this.state.selectedVariant;
    const cfg = this.state.configurator;

    try {
      const res = await OptiiAPI.createWhatsAppEnquiry({
        product_name: p.name,
        sku: v.sku,
        color_name: v.color_name,
        dimensions: p.dimensions ? p.dimensions.display_string : null,
        lens_usage: cfg.usage ? cfg.usage.name : 'Single Vision Distance',
        lens_thickness: cfg.thickness ? cfg.thickness.name : 'Standard 1.50',
        lens_coating: cfg.coating ? cfg.coating.name : 'Anti-Reflective',
        total_price_inr: cfg.pricing.grand_total_inr || (v.price_override_inr || p.base_price_inr)
      });

      if (res && res.whatsapp_url) {
        window.open(res.whatsapp_url, '_blank');
      }
    } catch (err) {
      console.error('WhatsApp Error:', err);
    }
  },

  // ─── CART & WISHLIST DRAWERS ───

  toggleCartDrawer(open) {
    if (window.OptiiCart) {
      OptiiCart.toggle(open);
      return;
    }
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('active', open);
      backdrop.classList.toggle('active', open);
      if (open) this.renderCart();
    }
  },

  renderCart() {
    if (window.OptiiCart) {
      OptiiCart.render();
      return;
    }
    const container = document.getElementById('cart-drawer-items');
    const subtotalEl = document.getElementById('cart-drawer-subtotal');
    if (!container) return;

    if (this.state.cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem;">
          <h4 style="font-size: 16px; font-weight: 500; margin-bottom: 6px;">Your Optical Bag is empty</h4>
          <p style="font-size: 13px; color: var(--color-ink-muted);">Select your handcrafted frame and custom prescription lenses.</p>
        </div>
      `;
      if (subtotalEl) subtotalEl.textContent = '₹0';
      return;
    }

    let subtotal = 0;
    container.innerHTML = this.state.cart.map((item, idx) => {
      subtotal += Number(item.item_price_inr || 0);
      const lenses = item.configured_lenses || {};
      return `
        <div style="display: flex; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--color-border); align-items: start;">
          <img style="width: 70px; height: 70px; object-fit: contain; background: var(--color-surface-subtle); padding: 4px;" src="/${item.image_url}" alt="${item.product_name}" />
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 600;">${item.product_name}</div>
            <div style="font-size: 12px; color: var(--color-ink-muted); margin-bottom: 4px;">${item.color_name} · ${item.dimensions}</div>
            
            <div style="font-size: 11px; background: var(--color-surface-subtle); padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 6px;">
              👁️ ${lenses.usage_name} · ${lenses.thickness_name}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <span style="font-weight: 600; font-size: 14px;">₹${Number(item.item_price_inr).toLocaleString('en-IN')}</span>
              <button onclick="OptiiPDP.removeFromCart(${idx})" style="font-size: 12px; color: #dc2626; text-decoration: underline;">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  },

  removeFromCart(index) {
    this.state.cart.splice(index, 1);
    localStorage.setItem('optii_cart', JSON.stringify(this.state.cart));
    this.renderCart();
    this.updateBadges();
  },

  toggleWishlist() {
    if (!this.state.product) return;
    const slug = this.state.product.slug;
    const idx = this.state.wishlist.indexOf(slug);
    if (idx === -1) {
      this.state.wishlist.push(slug);
    } else {
      this.state.wishlist.splice(idx, 1);
    }
    localStorage.setItem('optii_wishlist', JSON.stringify(this.state.wishlist));
    this.updateWishlistBtn();
    this.updateBadges();
  },

  updateWishlistBtn() {
    const btn = document.getElementById('pdp-wishlist-hero-btn');
    if (!btn || !this.state.product) return;
    const isSaved = this.state.wishlist.includes(this.state.product.slug);
    btn.classList.toggle('active', isSaved);
    btn.setAttribute('aria-label', isSaved ? 'Remove from Wishlist' : 'Save to Wishlist');
  },

  updateBadges() {
    const cartCount = this.state.cart.length;
    const wishCount = this.state.wishlist.length;

    const cartBadge = document.getElementById('cart-badge');
    if (cartBadge) {
      cartBadge.textContent = cartCount;
      cartBadge.style.display = cartCount > 0 ? 'flex' : 'none';
    }

    const wishBadge = document.getElementById('wishlist-badge');
    if (wishBadge) {
      wishBadge.textContent = wishCount;
      wishBadge.style.display = wishCount > 0 ? 'flex' : 'none';
    }
  },

  // ─── GLOBAL EVENTS & ACCORDIONS ───
  bindGlobalEvents() {
    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeConfigurator();
        this.closeZoomModal();
        this.toggleCartDrawer(false);
      }
    });

    // Accordions
    document.querySelectorAll('.pdp-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.pdp-accordion-item');
        if (item) item.classList.toggle('open');
      });
    });
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => OptiiPDP.init());
