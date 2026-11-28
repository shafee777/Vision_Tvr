/**
 * Optii Admin — Master Frame Detail, Variant Editor & 1-5 Ordered Image Gallery Controller
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatInr } from '../shared/formatters.js';
import { openModal, requestConfirmation, showToast } from '../shared/notifications.js';
import { ensureProductFilterTaxonomy, loadFrameCatalog } from './frames.js';

const IMAGE_TYPES = [
  { value: 'studio_front', label: 'Studio Front' },
  { value: 'model_on_face', label: 'Model Wearing' },
  { value: 'angle_45', label: '45° Perspective' },
  { value: 'hinge_detail', label: 'Hinge Detail' },
  { value: 'packaging', label: 'Case / Packaging' }
];

export async function loadFrameVariants(productId) {
  try {
    await ensureProductFilterTaxonomy(false);
    const res = await apiRequest(`/products/${productId}`);
    if (!res.success || !res.product) return;

    const product = res.product;
    const isAdmin = adminState.user?.role === 'admin';
    document.getElementById('variants-modal-title').textContent = `${product.name} (${product.sku})`;
    document.getElementById('variant-add-product-id').value = product.id;

    const masterContainer = document.getElementById('variants-master-summary');
    if (masterContainer) {
      masterContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:700;">${escapeHtml(product.name)}</div>
            <div style="font-size:13px;color:var(--ink-secondary);margin-top:2px;">
              Master SKU: <strong style="font-family:var(--font-mono);">${escapeHtml(product.sku)}</strong> ·
              ${escapeHtml(product.brand_name || '—')} · ${escapeHtml(product.category_name || '—')} · ${escapeHtml(product.shape_name || '—')} · ${escapeHtml(product.frame_type || 'Full Rim')}
            </div>
            <div style="font-size:12px;color:var(--ink-secondary);margin-top:4px;">
              Geometry: <strong>${product.lens_width_mm}-${product.bridge_width_mm}-${product.temple_length_mm} mm</strong> ·
              Fit: <strong>${escapeHtml(product.frame_fit)}</strong> ·
              Material: <strong>${escapeHtml(product.material)}</strong> ·
              Gender: <strong>${escapeHtml(product.gender)}</strong> ·
              Base Price: <strong>${formatInr(product.base_price_inr)}</strong>
            </div>
          </div>
          <span class="badge-status ${product.is_active ? 'active' : 'archived'}">${product.is_active ? 'Active' : 'Archived'}</span>
        </div>
        ${isAdmin ? `
          <details style="margin-top:10px;border-top:1px solid var(--border-light);padding-top:10px;">
            <summary style="cursor:pointer;font-size:12px;font-weight:700;">Edit Master Frame Details</summary>
            <form id="edit-master-frame-form" style="margin-top:10px;">
              <div class="form-grid-3">
                <div class="form-group">
                  <label class="form-label">Frame Name</label>
                  <input type="text" name="name" class="form-control" value="${escapeHtml(product.name)}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Base Price (INR)</label>
                  <input type="number" name="base_price_inr" class="form-control" value="${product.base_price_inr}" min="1" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Material</label>
                  <input type="text" name="material" class="form-control" value="${escapeHtml(product.material)}" required />
                </div>
              </div>
              <div class="form-grid-3">
                <div class="form-group">
                  <label class="form-label">Brand</label>
                  <select name="brand_id" class="form-control">
                    ${adminState.brands.map(b => `<option value="${b.id}" ${b.id === product.brand_id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Category</label>
                  <select name="category_id" class="form-control">
                    ${adminState.categories.map(c => `<option value="${c.id}" ${c.id === product.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Frame Shape</label>
                  <select name="shape_id" class="form-control">
                    ${adminState.shapes.map(s => `<option value="${s.id}" ${s.id === product.shape_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-grid-3">
                <div class="form-group">
                  <label class="form-label">Frame Type</label>
                  <select name="frame_type" class="form-control">
                    ${['Full Rim', 'Semi-Rimless', 'Rimless'].map(ft => `<option value="${ft}" ${(product.frame_type || 'Full Rim') === ft ? 'selected' : ''}>${ft}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Frame Fit</label>
                  <select name="frame_fit" class="form-control">
                    ${['Narrow', 'Medium', 'Wide'].map(f => `<option value="${f}" ${product.frame_fit === f ? 'selected' : ''}>${f}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Gender</label>
                  <select name="gender" class="form-control">
                    ${['unisex', 'men', 'women'].map(g => `<option value="${g}" ${product.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-grid-3">
                <div class="form-group">
                  <label class="form-label">Lens Width (mm)</label>
                  <input type="number" name="lens_width_mm" class="form-control" value="${product.lens_width_mm}" min="30" max="75" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Bridge Width (mm)</label>
                  <input type="number" name="bridge_width_mm" class="form-control" value="${product.bridge_width_mm}" min="10" max="35" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Temple Length (mm)</label>
                  <input type="number" name="temple_length_mm" class="form-control" value="${product.temple_length_mm}" min="100" max="180" required />
                </div>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Frame Height (mm)</label>
                  <input type="number" name="frame_height_mm" class="form-control" value="${product.frame_height_mm || ''}" min="20" max="90" />
                </div>
                <div class="form-group">
                  <label class="form-label">Total Frame Width (mm)</label>
                  <input type="number" name="total_width_mm" class="form-control" value="${product.total_width_mm || ''}" min="90" max="200" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Description</label>
                <textarea name="description" class="form-control">${escapeHtml(product.description || '')}</textarea>
              </div>
              <button type="submit" class="btn-primary btn-sm">Save Master Changes</button>
            </form>
          </details>
        ` : ''}
      `;

      const editMasterForm = document.getElementById('edit-master-frame-form');
      if (editMasterForm) {
        editMasterForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          try {
            await apiRequest(`/products/${product.id}`, {
              method: 'PUT',
              body: {
                name: editMasterForm.name.value.trim(),
                brand_id: Number(editMasterForm.brand_id.value),
                category_id: Number(editMasterForm.category_id.value),
                shape_id: Number(editMasterForm.shape_id.value),
                frame_type: editMasterForm.frame_type.value,
                frame_fit: editMasterForm.frame_fit.value,
                gender: editMasterForm.gender.value,
                base_price_inr: Number(editMasterForm.base_price_inr.value),
                material: editMasterForm.material.value.trim(),
                lens_width_mm: Number(editMasterForm.lens_width_mm.value),
                bridge_width_mm: Number(editMasterForm.bridge_width_mm.value),
                temple_length_mm: Number(editMasterForm.temple_length_mm.value),
                frame_height_mm: editMasterForm.frame_height_mm.value ? Number(editMasterForm.frame_height_mm.value) : null,
                total_width_mm: editMasterForm.total_width_mm.value ? Number(editMasterForm.total_width_mm.value) : null,
                description: editMasterForm.description.value.trim()
              }
            });
            showToast('Master frame updated.', 'success');
            loadFrameVariants(product.id);
            loadFrameCatalog();
          } catch (err) {
            showToast(err.message || 'Failed to update master frame.', 'error');
          }
        });
      }
    }

    const listContainer = document.getElementById('variants-list-container');
    if (listContainer) {
      if (!product.variants || product.variants.length === 0) {
        listContainer.innerHTML = '<div class="empty-state-box">No colour variants added yet. Add the first colorway below.</div>';
      } else {
        listContainer.innerHTML = product.variants.map(variant => {
          const imgs = variant.images || [];
          const remainingSlots = Math.max(0, 5 - imgs.length);
          const orderedIdsJson = escapeHtml(JSON.stringify(imgs.map(i => i.id)));
          return `
          <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:16px;height:16px;border-radius:50%;background:${escapeHtml(variant.color_hex)};border:1px solid rgba(0,0,0,0.15);display:inline-block;"></span>
                <span style="font-weight:700;">${escapeHtml(variant.color_name)}</span>
                <span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-secondary);">(${escapeHtml(variant.sku)})</span>
                ${variant.is_default ? '<span class="badge-status in_stock">Default</span>' : ''}
                ${!variant.is_active ? '<span class="badge-status archived">Inactive</span>' : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:13px;">Price: <strong>${formatInr(variant.price_override_inr || product.base_price_inr)}</strong></span>
                <span style="font-size:13px;">Stock: <strong>${variant.stock_quantity}</strong></span>
                <button type="button" class="btn-secondary btn-sm"
                  onclick="OptiiAdmin.openStockAdjustModal(${variant.id}, '${escapeHtml(variant.sku)}', '${escapeHtml(product.name).replace(/'/g, '')}', ${variant.stock_quantity})">
                  Adjust Stock
                </button>
                ${isAdmin ? `
                  <button type="button" class="btn-danger btn-sm"
                    onclick="OptiiAdmin.deleteVariant(${variant.id}, ${product.id}, '${escapeHtml(variant.sku)}')">
                    Delete
                  </button>
                ` : ''}
              </div>
            </div>

            ${isAdmin ? `
              <details style="margin:6px 0 10px;">
                <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--ink-secondary);">Edit Variant Details</summary>
                <form class="variant-inline-edit-form" data-variant-id="${variant.id}" style="margin-top:8px;">
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Colour Name</label>
                      <input type="text" name="color_name" class="form-control" value="${escapeHtml(variant.color_name)}" required />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Hex (#RRGGBB)</label>
                      <input type="text" name="color_hex" class="form-control" value="${escapeHtml(variant.color_hex)}" required />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Price Override (INR)</label>
                      <input type="number" name="price_override_inr" class="form-control" value="${variant.price_override_inr || ''}" placeholder="Blank = Base" min="0" />
                    </div>
                  </div>
                  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                      <input type="checkbox" name="is_default" ${variant.is_default ? 'checked' : ''} /> Default Colorway
                    </label>
                    <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                      <input type="checkbox" name="is_active" ${variant.is_active ? 'checked' : ''} /> Active
                    </label>
                    <button type="submit" class="btn-primary btn-sm">Update Variant</button>
                  </div>
                </form>
              </details>
            ` : ''}

            <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px;">
              <span style="font-size:12px;font-weight:700;color:var(--ink-secondary);">Variant Gallery (${imgs.length} / 5 images · Image #1 = Primary, #2 = Hover)</span>
            </div>

            <div class="staged-images-grid" style="grid-template-columns:repeat(auto-fill, minmax(126px, 1fr));">
              ${imgs.map((img, idx) => `
                <div class="staged-image-card" style="padding:6px;">
                  <div class="staged-image-thumb-wrap">
                    <img src="/${escapeHtml(img.image_url.replace(/^\/+/, ''))}" alt="${escapeHtml(img.image_type)}" />
                    ${idx === 0 ? '<span class="staged-image-badge">1 · Primary</span>' : (idx === 1 ? '<span class="staged-image-badge secondary">2 · Hover</span>' : `<span class="staged-image-badge secondary">#${idx + 1}</span>`)}
                  </div>
                  <div style="font-size:11px;color:var(--ink-secondary);text-align:center;">${escapeHtml(IMAGE_TYPES.find(t => t.value === img.image_type)?.label || img.image_type)}</div>
                  ${isAdmin ? `
                    <div class="staged-image-actions">
                      <div style="display:flex;gap:3px;">
                        <button type="button" class="btn-secondary btn-sm" style="padding:2px 6px;" ${idx === 0 ? 'disabled' : ''}
                          onclick="OptiiAdmin.moveVariantImage(${variant.id}, ${product.id}, ${idx}, -1, ${orderedIdsJson})" aria-label="Move left">←</button>
                        <button type="button" class="btn-secondary btn-sm" style="padding:2px 6px;" ${idx === imgs.length - 1 ? 'disabled' : ''}
                          onclick="OptiiAdmin.moveVariantImage(${variant.id}, ${product.id}, ${idx}, 1, ${orderedIdsJson})" aria-label="Move right">→</button>
                      </div>
                      ${idx > 0 ? `<button type="button" class="btn-secondary btn-sm" style="padding:2px 6px;font-size:11px;" onclick="OptiiAdmin.setVariantPrimaryImage(${img.id}, ${product.id})">1st</button>` : ''}
                      <button type="button" class="btn-danger btn-sm" style="padding:2px 6px;" onclick="OptiiAdmin.deleteProductImage(${img.id}, ${product.id})" aria-label="Delete image">×</button>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            ${isAdmin ? (remainingSlots > 0 ? `
              <form style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;" onsubmit="OptiiAdmin.handleUploadImage(event, ${variant.id}, ${product.id})">
                <select name="image_type" class="admin-select" style="height:34px;font-size:12px;">
                  ${IMAGE_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                </select>
                <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" style="font-size:12px;max-width:240px;" required
                  onchange="OptiiAdmin.handleVariantFilesSelected(this, ${remainingSlots})" />
                <button type="submit" class="btn-primary btn-sm">Upload (Up to ${remainingSlots} left)</button>
              </form>
            ` : '<div style="font-size:12px;color:var(--ink-secondary);margin-top:8px;">Maximum 5 images reached for this colorway. Remove an image to upload a replacement.</div>') : ''}
          </div>
          `;
        }).join('');

        listContainer.querySelectorAll('.variant-inline-edit-form').forEach(vForm => {
          vForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const variantId = Number(vForm.dataset.variantId);
            try {
              await apiRequest(`/variants/${variantId}`, {
                method: 'PUT',
                body: {
                  color_name: vForm.color_name.value.trim(),
                  color_hex: vForm.color_hex.value.trim(),
                  price_override_inr: vForm.price_override_inr.value ? Number(vForm.price_override_inr.value) : null,
                  is_default: vForm.is_default.checked ? 1 : 0,
                  is_active: vForm.is_active.checked ? 1 : 0
                }
              });
              showToast('Variant updated.', 'success');
              loadFrameVariants(product.id);
              loadFrameCatalog();
            } catch (err) {
              showToast(err.message || 'Failed to update variant.', 'error');
            }
          });
        });
      }
    }

    openModal('modal-variants-manager');
  } catch (err) {
    showToast(err.message || 'Error loading variants editor.', 'error');
  }
}

export function handleVariantFilesSelected(input, remainingSlots) {
  const files = Array.from(input.files || []);
  if (files.length > remainingSlots) {
    showToast(`Only ${remainingSlots} image slot(s) remaining (max 5 per colorway).`, 'error');
    input.value = '';
    return;
  }
  for (const f of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      showToast(`"${f.name}" must be JPEG, PNG, or WebP.`, 'error');
      input.value = '';
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast(`"${f.name}" exceeds the 5 MB limit.`, 'error');
      input.value = '';
      return;
    }
  }
}

export async function handleAddVariant(event) {
  event.preventDefault();
  const form = event.target;
  const productId = Number(document.getElementById('variant-add-product-id').value);

  const payload = {
    color_name: form.color_name.value.trim(),
    color_hex: form.color_hex.value.trim(),
    color_secondary_hex: form.color_secondary_hex.value.trim() || null,
    sku: form.sku.value.trim(),
    price_override_inr: form.price_override_inr?.value ? Number(form.price_override_inr.value) : null,
    stock_quantity: Number(form.stock_quantity.value || 0),
    is_default: form.is_default.checked ? 1 : 0
  };

  try {
    const res = await apiRequest(`/products/${productId}/variants`, {
      method: 'POST',
      body: payload
    });
    if (res.success) {
      showToast('Variant colorway added.', 'success');
      form.reset();
      loadFrameVariants(productId);
      loadFrameCatalog();
    }
  } catch (err) {
    showToast(err.message || 'Error adding variant.', 'error');
  }
}

export async function deleteVariant(variantId, productId, sku) {
  const confirmed = await requestConfirmation({
    title: 'Delete Colour Variant',
    message: `Delete colorway ${sku} and its gallery photos?`,
    confirmLabel: 'Delete Variant',
    danger: true
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/variants/${variantId}`, { method: 'DELETE' });
    showToast(`Variant ${sku} deleted.`, 'info');
    loadFrameVariants(productId);
    loadFrameCatalog();
  } catch (err) {
    showToast(err.message || 'Failed to delete variant.', 'error');
  }
}

export async function handleUploadImage(event, variantId, productId) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);

  try {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading…'; }
    const res = await fetch(`/api/admin/variants/${variantId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminState.token}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Photography view uploaded successfully.', 'success');
      loadFrameVariants(productId);
      loadFrameCatalog();
    } else {
      throw new Error(data.message || 'Upload error');
    }
  } catch (err) {
    showToast(err.message || 'Image upload failed.', 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Upload'; }
  }
}

export async function moveVariantImage(variantId, productId, index, delta, imageIds) {
  const target = index + delta;
  if (!Array.isArray(imageIds) || target < 0 || target >= imageIds.length) return;
  const reordered = [...imageIds];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved);

  try {
    await apiRequest(`/variants/${variantId}/images/reorder`, {
      method: 'PUT',
      body: { image_ids: reordered }
    });
    loadFrameVariants(productId);
    loadFrameCatalog();
  } catch (err) {
    showToast(err.message || 'Failed to reorder images.', 'error');
  }
}

export async function setVariantPrimaryImage(imageId, productId) {
  try {
    await apiRequest(`/images/${imageId}`, {
      method: 'PATCH',
      body: { set_primary: true }
    });
    showToast('Primary image updated.', 'success');
    loadFrameVariants(productId);
    loadFrameCatalog();
  } catch (err) {
    showToast(err.message || 'Failed to set primary image.', 'error');
  }
}

export async function deleteProductImage(imageId, productId) {
  const confirmed = await requestConfirmation({
    title: 'Remove Product Image',
    message: 'Are you sure you want to permanently remove this product image?',
    confirmLabel: 'Remove Image',
    danger: true
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/images/${imageId}`, { method: 'DELETE' });
    showToast('Image deleted.', 'info');
    loadFrameVariants(productId);
    loadFrameCatalog();
  } catch (err) {
    showToast(err.message || 'Failed to delete image.', 'error');
  }
}
