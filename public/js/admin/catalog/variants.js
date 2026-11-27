/**
 * Optii Admin — Master Frame Detail, Variant Editor & Image Gallery Controller
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatInr } from '../shared/formatters.js';
import { openModal, requestConfirmation, showToast } from '../shared/notifications.js';
import { loadFrameCatalog } from './frames.js';

export async function loadFrameVariants(productId) {
  try {
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
              ${escapeHtml(product.brand_name || '—')} · ${escapeHtml(product.category_name || '—')} · ${escapeHtml(product.shape_name || '—')}
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
                base_price_inr: Number(editMasterForm.base_price_inr.value),
                material: editMasterForm.material.value.trim(),
                lens_width_mm: Number(editMasterForm.lens_width_mm.value),
                bridge_width_mm: Number(editMasterForm.bridge_width_mm.value),
                temple_length_mm: Number(editMasterForm.temple_length_mm.value),
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
        listContainer.innerHTML = product.variants.map(variant => `
          <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:16px;height:16px;border-radius:50%;background:${escapeHtml(variant.color_hex)};border:1px solid rgba(0,0,0,0.15);display:inline-block;"></span>
                <span style="font-weight:700;">${escapeHtml(variant.color_name)}</span>
                <span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-secondary);">(${escapeHtml(variant.sku)})</span>
                ${variant.is_default ? '<span class="badge-status in_stock">Default</span>' : ''}
                ${!variant.is_active ? '<span class="badge-status archived">Inactive</span>' : ''}
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:13px;">Price: <strong>${formatInr(variant.price_override_inr || product.base_price_inr)}</strong></span>
                <span style="font-size:13px;">Stock: <strong>${variant.stock_quantity}</strong></span>
                <button type="button" class="btn-secondary btn-sm"
                  onclick="OptiiAdmin.openStockAdjustModal(${variant.id}, '${escapeHtml(variant.sku)}', '${escapeHtml(product.name)}', ${variant.stock_quantity})">
                  Adjust Stock
                </button>
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

            <div style="display:flex;gap:8px;overflow-x:auto;padding:6px 0;">
              ${(variant.images || []).map(img => `
                <div style="position:relative;width:64px;height:64px;border:1px solid var(--border-light);border-radius:var(--radius-sm);background:var(--bg-subtle);flex-shrink:0;">
                  <img src="/${escapeHtml(img.image_url)}" style="width:100%;height:100%;object-fit:contain;" alt="${escapeHtml(img.image_type)}" />
                  ${isAdmin ? `
                    <button type="button" onclick="OptiiAdmin.deleteProductImage(${img.id}, ${product.id})"
                      style="position:absolute;top:-4px;right:-4px;background:#991b1b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:12px;cursor:pointer;"
                      aria-label="Remove image">×</button>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            ${isAdmin ? `
              <form style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;" onsubmit="OptiiAdmin.handleUploadImage(event, ${variant.id}, ${product.id})">
                <select name="image_type" class="admin-select" style="height:32px;font-size:12px;">
                  <option value="studio_front">Studio Front</option>
                  <option value="angle_45">45° Perspective</option>
                  <option value="model_on_face">Model On-Face</option>
                  <option value="hinge_detail">Hinge Detail</option>
                </select>
                <input type="file" name="image" accept="image/jpeg,image/png,image/webp" style="font-size:12px;max-width:210px;" required />
                <button type="submit" class="btn-primary btn-sm">Upload View</button>
              </form>
            ` : ''}
          </div>
        `).join('');

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

export async function handleUploadImage(event, variantId, productId) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  try {
    const res = await fetch(`/api/admin/variants/${variantId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminState.token}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Photography view uploaded successfully.', 'success');
      loadFrameVariants(productId);
      loadFrameCatalog();
    } else {
      throw new Error(data.message || 'Upload error');
    }
  } catch (err) {
    showToast(err.message || 'Image upload failed.', 'error');
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
