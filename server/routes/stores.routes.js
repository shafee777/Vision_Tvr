const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/stores - List active optical branches
router.get('/', async (req, res) => {
  try {
    const stores = await db.all('SELECT * FROM stores WHERE is_active = 1');
    for (const store of stores) {
      store.hours = await db.all(
        'SELECT day_of_week, open_time, close_time, is_closed FROM store_hours WHERE store_id = ? ORDER BY day_of_week ASC',
        [store.id]
      );
    }
    res.json({ success: true, count: stores.length, stores });
  } catch (err) {
    console.error('Stores Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/stores/:id/slots?date=YYYY-MM-DD - Dynamic 30-min available appointment slots
router.get('/:id/slots', async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Query parameter date (YYYY-MM-DD) is required.' });
    }

    const store = await db.get('SELECT * FROM stores WHERE id = ? AND is_active = 1', [storeId]);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found.' });
    }

    // Determine day of week for the date (0 = Sunday, 1 = Monday, ...)
    const reqDate = new Date(date);
    if (isNaN(reqDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const dayOfWeek = reqDate.getUTCDay();

    const hours = await db.get(
      'SELECT open_time, close_time, is_closed FROM store_hours WHERE store_id = ? AND day_of_week = ?',
      [storeId, dayOfWeek]
    );

    if (!hours || hours.is_closed) {
      return res.json({ success: true, date, is_store_closed: true, slots: [] });
    }

    // Generate 30-minute intervals between open_time and close_time
    const intervalMinutes = store.slot_interval_minutes || 30;
    const [openH, openM] = hours.open_time.split(':').map(Number);
    const [closeH, closeM] = hours.close_time.split(':').map(Number);

    const openTotal = openH * 60 + openM;
    const closeTotal = closeH * 60 + closeM;

    // Fetch existing confirmed bookings for this date and store
    const existingBookings = await db.all(
      `SELECT start_time FROM appointments 
       WHERE store_id = ? AND appointment_date = ? AND status != 'cancelled'`,
      [storeId, date]
    );
    const bookedSet = new Set(existingBookings.map(b => b.start_time));

    const slots = [];
    for (let current = openTotal; current + intervalMinutes <= closeTotal; current += intervalMinutes) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      const endH = Math.floor((current + intervalMinutes) / 60);
      const endM = (current + intervalMinutes) % 60;

      const formatTime = (hour, min) => `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const startTime = formatTime(h, m);
      const endTime = formatTime(endH, endM);

      // Human-readable format (e.g. 10:30 AM)
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      const label = `${displayHour}:${String(m).padStart(2, '0')} ${period}`;

      const isBooked = bookedSet.has(startTime);

      slots.push({
        start_time: startTime,
        end_time: endTime,
        display_label: label,
        is_available: !isBooked
      });
    }

    res.json({
      success: true,
      store: { id: store.id, name: store.name },
      date,
      is_store_closed: false,
      total_slots: slots.length,
      available_slots: slots.filter(s => s.is_available).length,
      slots
    });
  } catch (err) {
    console.error('Slots Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
