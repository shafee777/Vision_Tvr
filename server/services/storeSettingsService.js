/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — UNIFIED STORE SETTINGS SERVICE
 * Single source of truth for store identity, WhatsApp routing, & hours
 * ═════════════════════════════════════════════════════════════════════
 */

const db = require('../db/database');
const config = require('../config');

async function getPublicStoreSettings() {
  const [storeRow, hoursRows, siteRows] = await Promise.all([
    db.get('SELECT * FROM stores WHERE id = 1'),
    db.all('SELECT day_of_week, open_time, close_time, is_closed FROM store_hours WHERE store_id = 1 ORDER BY day_of_week ASC'),
    db.all('SELECT key, value, description FROM site_settings')
  ]);

  const settingsMap = {};
  (siteRows || []).forEach((r) => {
    settingsMap[r.key] = r.value;
  });

  const fallbackPhone = config.WHATSAPP_PHONE || '+919486552324';
  const store = storeRow ? {
    id: storeRow.id,
    name: storeRow.name || config.STORE_NAME || 'Vision Opticals',
    address: storeRow.address || '',
    city: storeRow.city || '',
    phone: storeRow.phone || fallbackPhone,
    whatsapp_number: storeRow.whatsapp_number || settingsMap.whatsapp_number || storeRow.phone || fallbackPhone,
    email: storeRow.email || '',
    logo_url: storeRow.logo_url || '',
    description: storeRow.description || '',
    map_url: storeRow.map_url || '',
    instagram_url: storeRow.instagram_url || '',
    facebook_url: storeRow.facebook_url || '',
    slot_interval_minutes: storeRow.slot_interval_minutes || 30,
    is_active: storeRow.is_active
  } : {
    id: 1,
    name: config.STORE_NAME || 'Vision Opticals',
    address: '12 Kamalalayam West Bank, Near Railway Feeder Rd',
    city: 'Thiruvarur',
    phone: fallbackPhone,
    whatsapp_number: settingsMap.whatsapp_number || fallbackPhone,
    email: 'care@optii.in',
    logo_url: '',
    description: '',
    map_url: '',
    instagram_url: '',
    facebook_url: '',
    slot_interval_minutes: 30,
    is_active: 1
  };

  return {
    store,
    hours: hoursRows || [],
    settings: settingsMap,
    rawSettingsList: siteRows || []
  };
}

module.exports = {
  getPublicStoreSettings
};
