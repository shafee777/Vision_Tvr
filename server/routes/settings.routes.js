const express = require('express');
const router = express.Router();
const { getPublicStoreSettings } = require('../services/storeSettingsService');

// GET /api/settings — Public storefront settings, store identity, and operating hours
router.get('/', async (req, res) => {
  try {
    const data = await getPublicStoreSettings();
    res.json({
      success: true,
      store: data.store,
      hours: data.hours,
      settings: data.settings
    });
  } catch (err) {
    console.error('Public Settings Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
