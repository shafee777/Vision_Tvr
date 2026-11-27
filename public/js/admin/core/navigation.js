/**
 * Optii Admin — Navigation, Topbar Title & RBAC Sidebar Guards
 */

import { adminState } from './state.js';

const SECTION_TITLES = {
  dashboard: 'Overview & Store Health',
  products: 'Frames & Variants Catalogue',
  inventory: 'Inventory & Stock Control',
  lenses: 'Lens Pricing & Tiers',
  taxonomy: 'Brands, Shapes & Categories',
  orders: 'Orders & Lab Fulfillment',
  appointments: 'Eye Test Appointments',
  enquiries: 'Customer Enquiries',
  users: 'Team & Role Permissions',
  audit: 'Activity Log & Audit Trail',
  settings: 'Store & Clinic Settings'
};

let sectionLoaders = {};

export function registerSectionLoaders(loaders) {
  sectionLoaders = loaders;
}

export function applyRoleGuards() {
  const role = adminState.user?.role || 'staff';
  document.querySelectorAll('[data-role-guard]').forEach(el => {
    const allowed = el.getAttribute('data-role-guard').split(',').map(s => s.trim());
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
}

export function switchSection(sectionId, options = {}) {
  adminState.activeSection = sectionId;

  document.querySelectorAll('.sidebar-item').forEach(btn => {
    const isActive = btn.getAttribute('data-sec') === sectionId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `sec-${sectionId}`);
  });

  const titleEl = document.getElementById('topbar-active-title');
  if (titleEl) {
    titleEl.textContent = SECTION_TITLES[sectionId] || 'Vision Opticals Administration';
  }

  const sidebar = document.getElementById('admin-sidebar');
  if (sidebar) sidebar.classList.remove('open');

  if (!options.skipLoad && typeof sectionLoaders[sectionId] === 'function') {
    sectionLoaders[sectionId](options);
  }
}

export function toggleMobileSidebar(forceState) {
  const sidebar = document.getElementById('admin-sidebar');
  if (!sidebar) return;
  if (typeof forceState === 'boolean') {
    sidebar.classList.toggle('open', forceState);
  } else {
    sidebar.classList.toggle('open');
  }
}
