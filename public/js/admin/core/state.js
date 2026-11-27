/**
 * Optii Admin — Centralized Reactive Application State
 */

export const adminState = {
  token: localStorage.getItem('optii_admin_jwt') || '',
  user: null,
  activeSection: 'dashboard',
  analyticsDays: 30,

  // Catalog state
  products: [],
  productFilters: {
    search: '',
    brand: '',
    category: '',
    shape: '',
    status: 'all',
    sort: 'newest',
    limit: 25,
    offset: 0
  },
  productsTotal: 0,

  // Inventory state
  inventory: [],
  inventoryFilters: {
    search: '',
    brand_id: '',
    category_id: '',
    stock_status: 'all',
    sort: 'stock_asc',
    limit: 50,
    offset: 0
  },
  inventoryTotal: 0,
  inventorySummary: null,
  movements: [],

  // Operations & Administration
  appointments: [],
  orders: [],
  enquiries: [],
  lenses: { usages: [], thicknesses: [], coatings: [] },
  brands: [],
  shapes: [],
  categories: [],
  users: [],
  auditLogs: [],
  settings: [],
  store: null
};
