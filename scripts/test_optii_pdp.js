const http = require('http');
const path = require('path');
const fs = require('fs');
const { startServer } = require('../server/index');

async function runPDPTests() {
  console.log('\n===============================================================');
  console.log('🔬 STARTING COMPLETE OPTII PHASE 3 PDP & CONFIGURATOR VALIDATION');
  console.log('===============================================================\n');

  const TEST_PORT = 5088;
  const server = await startServer(TEST_PORT);
  let passedCount = 0;
  let failedCount = 0;

  function record(title, endpoint, success, details, status) {
    if (success) {
      console.log(`✅ PASS | [${status || 200}] ${title.padEnd(42)} (${endpoint})`);
      passedCount++;
    } else {
      console.error(`❌ FAIL | [${status || 'ERR'}] ${title.padEnd(42)} (${endpoint})`);
      if (details) console.error(`   -> Error Details:`, JSON.stringify(details));
      failedCount++;
    }
  }

  function request(endpoint, options = {}) {
    return new Promise((resolve) => {
      const url = `http://localhost:${TEST_PORT}${endpoint}`;
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      let bodyData = null;
      if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
        bodyData = JSON.stringify(options.body);
        reqOptions.headers['Content-Type'] = 'application/json';
        reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyData);
      } else if (options.body instanceof Buffer) {
        bodyData = options.body;
      }

      const req = http.request(reqOptions, (res) => {
        let rawData = [];
        res.on('data', (chunk) => rawData.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(rawData);
          let parsed = null;
          try {
            parsed = JSON.parse(buffer.toString('utf8'));
          } catch (e) {
            parsed = buffer.toString('utf8');
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, buffer });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  // Helper for multipart/form-data upload
  function uploadFile(endpoint, fieldName, filename, fileBuffer, mimeType, headers = {}) {
    return new Promise((resolve) => {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const pre = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      );
      const post = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([pre, fileBuffer, post]);

      const reqOptions = {
        hostname: 'localhost',
        port: TEST_PORT,
        path: endpoint,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      };

      const req = http.request(reqOptions, (res) => {
        let rawData = '';
        res.on('data', (c) => (rawData += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(rawData); } catch (e) { parsed = rawData; }
          resolve({ status: res.statusCode, data: parsed });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      req.write(body);
      req.end();
    });
  }

  try {
    // 1. PDP Payload & Millimeter Specs
    const pdp = await request('/api/products/henry-round-acetate');
    const p = pdp.data.product;
    const hasDims = p && p.dimensions && p.dimensions.display_string === '51-20-150 mm';
    const hasImages = p && p.variants && p.variants[0].images.length >= 2;
    const hasRelated = p && Array.isArray(p.related_products) && p.related_products.length > 0;
    record('PDP Payload & Millimeter Dimensions', '/api/products/henry-round-acetate',
      pdp.status === 200 && hasDims && hasImages && hasRelated,
      { dims: p?.dimensions, relatedCount: p?.related_products?.length }, pdp.status
    );

    // 2. All 6 Lens Usage Tiers (Step 1)
    const lenses = await request('/api/lenses');
    const steps = lenses.data && lenses.data.steps;
    const hasAllUsages = steps && steps.step1_usages.length >= 6;
    record('All 6 Optical Lens Usage Tiers', '/api/lenses',
      lenses.status === 200 && hasAllUsages,
      steps?.step1_usages?.map(u => u.name), lenses.status
    );

    // 3. Dynamic Optical Pricing Calculation
    // Frame 9,500 + Progressive (2,500) + 1.67 Super Thin (2,400) + Blue Shield (800) = 15,200
    const calc = await request('/api/lenses/calculate', {
      method: 'POST',
      body: {
        frame_price_inr: 9500,
        usage_id: 3,
        thickness_id: 3,
        coating_id: 2
      }
    });
    const c = calc.data && calc.data.calculation;
    const isMathCorrect = c && c.grand_total_inr === 15200 && c.total_lenses_inr === 5700;
    record('Server-Side Dynamic Optical Math', '/api/lenses/calculate',
      calc.status === 200 && isMathCorrect,
      c, calc.status
    );

    // 4. Secure Prescription Upload Validation: Reject Invalid File Type (.txt)
    const badUpload = await uploadFile(
      '/api/prescriptions/upload',
      'prescription',
      'test_prescription.txt',
      Buffer.from('Fake prescription file text contents'),
      'text/plain'
    );
    record('Prescription Security: Reject Invalid File Type', '/api/prescriptions/upload',
      badUpload.status === 400 && badUpload.data.error === 'INVALID_FILE_TYPE',
      badUpload.data, badUpload.status
    );

    // 5. Secure Prescription Upload: Accept Valid JPEG/PNG
    const dummyImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const goodUpload = await uploadFile(
      '/api/prescriptions/upload',
      'prescription',
      'dr_ramanathan_prescription.png',
      dummyImageBuffer,
      'image/png'
    );
    const rxToken = goodUpload.data && goodUpload.data.prescription_token;
    record('Prescription Security: Valid Upload & Token Creation', '/api/prescriptions/upload',
      goodUpload.status === 201 && !!rxToken,
      goodUpload.data, goodUpload.status
    );

    // 6. Secure Prescription Access Control: Reject Unauthenticated Request (403)
    const unauthGet = await request(`/api/prescriptions/${rxToken}`);
    record('Prescription Security: Reject Unauthenticated Access', `/api/prescriptions/${rxToken}`,
      unauthGet.status === 403,
      unauthGet.data, unauthGet.status
    );

    // 7. Secure Prescription Access Control: Allow Bearer / Token Authorized Access (200)
    const authGet = await request(`/api/prescriptions/${rxToken}`, {
      headers: { 'x-prescription-token': rxToken }
    });
    record('Prescription Security: Allow Authorized Session Access', `/api/prescriptions/${rxToken}`,
      authGet.status === 200 && authGet.headers['content-type'] === 'image/png',
      { status: authGet.status, contentType: authGet.headers['content-type'] }, authGet.status
    );

    // 8. WhatsApp Enquiry Generation (Safe Encoding without Prescription PII)
    const waEnquiry = await request('/api/enquiries/whatsapp', {
      method: 'POST',
      body: {
        product_name: 'Henry Round Acetate',
        sku: 'OPT-HEN-01-TIG',
        color: 'Tigerwood',
        price_inr: 15200,
        lens_usage: 'Progressive / Multifocal',
        lens_thickness: 'Super Thin 1.67 Index',
        lens_coating: 'Blue Light Shield Coating'
      }
    });
    const waUrl = waEnquiry.data && waEnquiry.data.whatsapp_url;
    const hasSafeWaUrl = waUrl && waUrl.includes('wa.me') && waUrl.includes('Tigerwood') && !waUrl.includes('dr_ramanathan');
    record('WhatsApp Lead Generation with Safe Configuration Encoding', '/api/enquiries/whatsapp',
      waEnquiry.status === 200 && hasSafeWaUrl,
      waEnquiry.data, waEnquiry.status
    );

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`TOTAL AUDIT CHECKS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('===============================================================\n');

  if (failedCount === 0) {
    console.log('✨ PHASE 3 BACKEND & API SUITE 100% VERIFIED!\n');
    process.exit(0);
  } else {
    console.error('❌ PHASE 3 VALIDATION FAILED: Some tests did not pass.\n');
    process.exit(1);
  }
}

if (require.main === module) {
  runPDPTests();
}

module.exports = runPDPTests;
