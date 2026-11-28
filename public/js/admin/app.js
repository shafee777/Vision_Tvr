/**
 * Optii Admin — Main Application Entry Point & Compatibility Facade
 */

import { adminState } from './core/state.js';
import { setOnSessionExpired } from './core/api-client.js';
import { applyRoleGuards, registerSectionLoaders, switchSection, toggleMobileSidebar } from './core/navigation.js';
import { closeModal, openModal, resolveConfirmation, showToast, trapModalFocus } from './shared/notifications.js';

import { loadDashboardMetrics } from './dashboard/dashboard.js';
import {
  debouncedProductSearch,
  goToNewProductStep,
  handleCreateProduct,
  loadFrameCatalog,
  moveStagedProductImage,
  nextNewProductStep,
  openNewProductModal,
  prevNewProductStep,
  removeStagedProductImage,
  setStagedProductPrimaryImage,
  switchCatalogSubtab,
  toggleProductActive,
  updateProductFilter,
  updateStagedProductImageType
} from './catalog/frames.js';
import {
  deleteProductImage,
  deleteVariant,
  handleAddVariant,
  handleUploadImage,
  handleVariantFilesSelected,
  loadFrameVariants,
  moveVariantImage,
  setVariantPrimaryImage
} from './catalog/variants.js';
import {
  addBlankCatalogueRow,
  applyMappingAndValidate,
  commitCatalogueImport,
  downloadCatalogueTemplate,
  downloadImportErrorReport,
  filterCataloguePreview,
  initCatalogueImportEvents,
  loadCatalogueImportHistory,
  parsePastedCatalogueRows,
  resetCatalogueImport,
  setCatalogueStep,
  validateCatalogueImport
} from './catalog/catalogue-import.js';
import {
  debouncedInventorySearch,
  exportFilteredInventoryCsv,
  loadInventoryItems,
  switchInventorySubtab,
  updateInventoryFilter,
  viewVariantMovements
} from './inventory/inventory.js';
import {
  openStockAdjustModal,
  submitStockAdjustment,
  updateAdjustedStockPreview
} from './inventory/stock-adjustment.js';
import {
  addBlankStockCountRow,
  commitStockCountImport,
  downloadStockCountSheet,
  initStockImportEvents,
  loadStockImportHistory,
  parsePastedStockRows,
  validateStockCountImport
} from './inventory/stock-import.js';
import {
  debouncedOrderSearch,
  handleOrderTransition,
  loadOrders,
  refundOrder,
  viewOrderDetail
} from './operations/orders.js';
import {
  handleReschedule,
  loadAppointments,
  openRescheduleModal,
  updateApptStatus
} from './operations/appointments.js';
import { loadEnquiries, updateEnquiryStatus } from './operations/enquiries.js';
import { editLensPrice, editStep2Option, handleSaveLensPrice, loadLenses, openLensModal, saveStep2Option } from './administration/lenses.js';
import {
  deleteTaxonomyItem,
  filterTaxonomyList,
  handleCreateBrand,
  loadTaxonomy,
  openBrandModal,
  openCategoryModal,
  openShapeModal,
  removeBrandLogo,
  saveBrandModal,
  saveCategoryModal,
  saveShapeModal,
  selectShapePreset,
  toggleTaxonomyStatus,
  updateShapeSvgPreview
} from './administration/taxonomy.js';
import { deleteUser, handleCreateUser, loadUsers, openNewUserModal } from './administration/team.js';
import { loadAuditLogs } from './administration/audit.js';
import { handleSaveSettings, loadSettings, previewStoreLogoFile, removeStoreLogo, uploadStoreLogo } from './administration/settings.js';

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-screen').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'flex';

  const nameEl = document.getElementById('user-profile-name');
  const roleEl = document.getElementById('user-profile-role');
  if (nameEl) nameEl.textContent = adminState.user?.full_name || adminState.user?.name || adminState.user?.username || 'Staff';
  if (roleEl) roleEl.textContent = (adminState.user?.role || 'staff').toUpperCase();

  applyRoleGuards();
  switchSection('dashboard');
}

function logout() {
  adminState.token = '';
  adminState.user = null;
  localStorage.removeItem('optii_admin_jwt');
  const passInp = document.getElementById('login-password');
  if (passInp) passInp.value = '';
  showLoginScreen();
  showToast('Signed out successfully.', 'info');
}

async function verifySession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminState.token}` }
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      adminState.user = data.user;
      showMainApp();
    } else {
      logout();
    }
  } catch (_) {
    logout();
  }
}

async function handleLogin(event) {
  if (event) event.preventDefault();
  const userInp = document.getElementById('login-username');
  const passInp = document.getElementById('login-password');
  const btn = document.getElementById('btn-login-submit');

  const username = (userInp?.value || '').trim();
  const password = (passInp?.value || '').trim();
  if (!username || !password) {
    showToast('Please provide both username and password.', 'error');
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
      adminState.token = data.token;
      adminState.user = data.user;
      localStorage.setItem('optii_admin_jwt', data.token);
      showToast(`Welcome back, ${data.user.name || data.user.username}!`, 'success');
      showMainApp();
    } else {
      showToast(data.message || 'Invalid username or password.', 'error');
    }
  } catch (_) {
    showToast('Login network error. Ensure server is active.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign In to Operations';
    }
  }
}

function fillRoleCreds(role) {
  const userInp = document.getElementById('login-username');
  const passInp = document.getElementById('login-password');
  document.querySelectorAll('.role-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`role-tab-${role}`)?.classList.add('active');
  if (userInp) userInp.value = role;
  if (passInp) {
    passInp.value = '';
    passInp.focus();
  }
}

async function initAdminApp() {
  setOnSessionExpired(logout);

  registerSectionLoaders({
    dashboard: () => loadDashboardMetrics(),
    products: () => loadFrameCatalog(),
    inventory: () => loadInventoryItems(),
    lenses: () => loadLenses(),
    taxonomy: () => loadTaxonomy(),
    orders: () => loadOrders(),
    appointments: () => loadAppointments(),
    enquiries: () => loadEnquiries(),
    users: () => loadUsers(),
    audit: () => loadAuditLogs(),
    settings: () => loadSettings()
  });

  initCatalogueImportEvents();
  initStockImportEvents();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.admin-modal-backdrop.active').forEach(m => closeModal(m.id));
      toggleMobileSidebar(false);
    } else if (event.key === 'Tab') {
      trapModalFocus(event);
    }
  });

  if (adminState.token) {
    await verifySession();
  } else {
    showLoginScreen();
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (roleParam === 'staff' || roleParam === 'optometrist' || roleParam === 'admin') {
      fillRoleCreds(roleParam);
    }
  }
}

// Controlled compatibility facade for HTML event attributes & console diagnostics
window.OptiiAdmin = {
  state: adminState,
  handleLogin,
  fillRoleCreds,
  logout,
  switchSection,
  toggleMobileSidebar,
  openModal,
  closeModal,
  resolveConfirmation,

  // Dashboard
  loadDashboard: loadDashboardMetrics,
  loadDashboardMetrics,

  // Catalog & Variants
  loadProducts: loadFrameCatalog,
  loadFrameCatalog,
  debouncedProductSearch,
  updateProductFilter,
  switchCatalogSubtab,
  openNewProductModal,
  goToNewProductStep,
  nextNewProductStep,
  prevNewProductStep,
  handleCreateProduct,
  toggleProductActive,
  removeStagedProductImage,
  moveStagedProductImage,
  setStagedProductPrimaryImage,
  updateStagedProductImageType,
  viewProductVariants: loadFrameVariants,
  loadFrameVariants,
  handleAddVariant,
  deleteVariant,
  handleVariantFilesSelected,
  handleUploadImage,
  moveVariantImage,
  setVariantPrimaryImage,
  deleteProductImage,

  // Catalogue Bulk Import
  resetCatalogueImport,
  downloadCatalogueTemplate,
  parsePastedCatalogueRows,
  setCatalogueStep,
  applyMappingAndValidate,
  validateCatalogueImport,
  addBlankCatalogueRow,
  filterCataloguePreview,
  commitCatalogueImport,
  loadCatalogueImportHistory,
  downloadImportErrorReport,

  // Inventory & Stock Import
  loadInventory: loadInventoryItems,
  loadInventoryItems,
  debouncedInventorySearch,
  updateInventoryFilter,
  exportFilteredInventoryCsv,
  switchInventorySubtab,
  viewVariantMovements,
  openStockAdjustModal,
  updateAdjustedStockPreview,
  handleStockAdjustment: submitStockAdjustment,
  submitStockAdjustment,
  downloadStockCountSheet,
  parsePastedStockRows,
  validateStockCountImport,
  addBlankStockCountRow,
  commitStockCountImport,
  loadStockImportHistory,

  // Operations
  loadOrders,
  debouncedOrderSearch,
  viewOrderDetail,
  refundOrder,
  handleOrderTransition,
  loadAppointments,
  updateApptStatus,
  openRescheduleModal,
  handleReschedule,
  loadEnquiries,
  updateEnquiryStatus,

  // Administration
  loadLenses,
  openLensModal,
  editLensPrice,
  handleSaveLensPrice,
  editStep2Option,
  saveStep2Option,
  loadTaxonomy,
  filterTaxonomyList,
  handleCreateBrand,
  openBrandModal,
  saveBrandModal,
  removeBrandLogo,
  openShapeModal,
  saveShapeModal,
  selectShapePreset,
  updateShapeSvgPreview,
  openCategoryModal,
  saveCategoryModal,
  toggleTaxonomyStatus,
  deleteTaxonomyItem,
  loadUsers,
  openNewUserModal,
  handleCreateUser,
  deleteUser,
  loadAuditLogs,
  loadSettings,
  previewStoreLogoFile,
  uploadStoreLogo,
  removeStoreLogo,
  handleSaveSettings
};

document.addEventListener('DOMContentLoaded', initAdminApp);
