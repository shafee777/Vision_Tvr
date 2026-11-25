const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { appointmentLimiter } = require('../middleware/rateLimiter');
const { validateBody } = require('../middleware/validate');
const { appointmentCreateSchema } = require('../validators/schemas');

// POST /api/appointments - Book in-store eye test appointment with collision prevention & schema validation
router.post('/', appointmentLimiter, validateBody(appointmentCreateSchema), async (req, res) => {
  try {
    const {
      store_id = 1,
      customer_name,
      customer_phone,
      customer_email,
      appointment_date,
      start_time,
      end_time,
      notes
    } = req.body;

    if (!customer_name || !customer_phone || !appointment_date || !start_time) {
      return res.status(400).json({
        success: false,
        message: 'customer_name, customer_phone, appointment_date, and start_time are required.'
      });
    }

    // Verify store exists
    const store = await db.get('SELECT * FROM stores WHERE id = ? AND is_active = 1', [store_id]);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Selected optical store branch not found.' });
    }

    // Calculate end time if omitted (default: +30 minutes)
    let calculatedEndTime = end_time;
    if (!calculatedEndTime) {
      const [h, m] = start_time.split(':').map(Number);
      const total = h * 60 + m + (store.slot_interval_minutes || 30);
      calculatedEndTime = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    // Generate unique appointment reference: OPT-APP-YYYY-XXXX
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const appointmentNumber = `OPT-APP-${year}-${randomSuffix}`;

    try {
      const result = await db.run(
        `INSERT INTO appointments (
           appointment_number, store_id, customer_name, customer_phone, customer_email,
           appointment_date, start_time, end_time, status, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
        [
          appointmentNumber,
          store_id,
          customer_name.trim(),
          customer_phone.trim(),
          customer_email ? customer_email.trim() : null,
          appointment_date,
          start_time,
          calculatedEndTime,
          notes ? notes.trim() : null
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Appointment confirmed successfully.',
        appointment: {
          id: result.lastID,
          appointment_number: appointmentNumber,
          store_name: store.name,
          store_address: store.address,
          customer_name,
          appointment_date,
          start_time,
          end_time: calculatedEndTime,
          status: 'confirmed'
        }
      });
    } catch (insertErr) {
      // Check for unique slot collision constraint violation
      if (insertErr.message && (insertErr.message.includes('UNIQUE constraint failed') || insertErr.message.includes('idx_unique_appointment_slot'))) {
        return res.status(409).json({
          success: false,
          error_code: 'SLOT_ALREADY_BOOKED',
          message: 'This appointment slot has already been reserved. Please select another available time.'
        });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Book Appointment Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/appointments - List appointments (Protected)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date, status, store_id } = req.query;
    let conditions = [];
    let params = [];

    if (date) {
      conditions.push('a.appointment_date = ?');
      params.push(date);
    }
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (store_id) {
      conditions.push('a.store_id = ?');
      params.push(Number(store_id));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT a.*, s.name as store_name, s.address as store_address
      FROM appointments a
      JOIN stores s ON s.id = a.store_id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.start_time ASC
    `;
    const appointments = await db.all(sql, params);
    res.json({ success: true, count: appointments.length, appointments });
  } catch (err) {
    console.error('List Appointments Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/appointments/:id/status - Update appointment status (Protected)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: [${validStatuses.join(', ')}]` });
    }

    const result = await db.run('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    res.json({ success: true, message: `Appointment status updated to ${status}.` });
  } catch (err) {
    console.error('Update Appointment Status Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
