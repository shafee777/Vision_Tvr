# Optii Platform — Payment Gateway Integration & Financial State Integrity Specification

**Document Version:** 1.0.0  
**Effective Date:** 2026-11-22  
**Target Platform:** Optii Greenfield Optical Retail E-Commerce Platform  
**Target Domain:** `https://optii.in` / `https://www.optii.in`  
**Security Standard:** PCI-DSS Level 4 Compliant Architecture (Zero Raw Card Storage), HMAC-SHA256 Signature Verification, Webhook Idempotency Ledger  

---

## 1. Executive Overview

In optical e-commerce, payment integrity is inextricably linked to manufacturing workflows. Once a prescription optical frame order is paid, precision optical lenses are surfaced, bevelled, and glazed to custom patient measurements—an irreversible laboratory process. Consequently, the platform must guarantee:
1. **Financial State Integrity:** Simulated/sandbox demonstration transactions must **never** be counted as actual revenue received in financial ledgers or admin dashboards.
2. **Transition Immutability:** Strict server-side state machines must block illegal transitions (e.g., capturing payment on cancelled orders, duplicate captures, or repaying refunded orders).
3. **Replay-Attack Immunity:** Server-to-server webhook ingestion must enforce cryptographic signature validation and permanent idempotency logging.
4. **Domestic Payment Compatibility:** Seamless support for Indian payment instruments (UPI Intent, RuPay, Credit/Debit cards, Net Banking, and Cardless EMI) through leading gateways (Razorpay and Cashfree).

---

## 2. Indian Optical Retail Gateway Evaluation: Razorpay vs. Cashfree

| Evaluation Dimension | Razorpay | Cashfree | Optii Recommendation |
|---|---|---|---|
| **Domestic UPI Market Share** | Dominant (~70% of Indian e-commerce checkout traffic). Native UPI Intent via GPay, PhonePe, Paytm, and CRED. | Strong secondary UPI processing; highly competitive UPI AutoPay support. | **Razorpay** provides higher customer familiarization and trust for luxury optical transactions. |
| **Transaction MDR (Fees)** | **Standard:** 2.0% + 18% GST across Cards, Net Banking, and UPI.<br/>**RuPay Debit & UPI:** 0% on select merchant categories. | **Standard:** 1.75% to 1.90% + GST on cards and net banking.<br/>Competitive volume discounting for retail brands. | **Cashfree** offers slightly lower interchange fees; **Razorpay** offers superior drop-in checkout UX. |
| **Cardless EMI & Affordability** | Extensive pre-approved credit integrations (ZestMoney, EarlySalary, KreditBee, ICICI/HDFC debit EMI). | Strong BNPL coverage (Simpl, LazyPay, Snapmint, ZestMoney). | **Tie.** Both enable splitting high-value prescription eyewear (₹10,000–₹25,000) into 3–12 monthly instalments. |
| **Webhook Reliability & Security** | Real-time `payment.captured`, `order.paid`, and `refund.processed` webhooks. Cryptographically signed via `X-Razorpay-Signature` (HMAC-SHA256). | Event-driven webhooks with `X-Webhook-Signature` and timestamp verification. | **Razorpay** signatures are validated with a single constant-time HMAC check against the raw body. |
| **Automated Refunds API** | Instant refunds via UPI/Cards with dedicated webhook notifications (`refund.processed`, `refund.failed`). | Native auto-refunds and Payouts rail for fast settlement. | **Razorpay** instant refund pipeline integrates cleanly with Optii's atelier return policy. |
| **Production Recommendation** | **Primary Gateway Rails:** Onboard **Razorpay** for customer storefront checkout. Keep **Cashfree** as hot standby fallback gateway. |

---

## 3. Optii Unified Payment Architecture

The Optii platform implements an abstract, gateway-agnostic payment layer consisting of:
- **Service Layer:** `server/services/paymentGateway.js`
- **REST Endpoints:** `server/routes/payments.routes.js`
- **Database Schema:** `orders` payment columns and `payment_webhooks` idempotency ledger ([Migration 006](file:///c:/Users/shafe/Desktop/Projects/optii/server/db/migrations/006_payment_state_integrity.sql))

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STOREFRONT CHECKOUT                               │
│  1. Customer reviews customized frame & precision glazed lenses            │
│  2. Customer selects Payment Mode: "Online Payment (UPI / Cards / NetBank)"  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/orders (Draft Order + Stock Reserve)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OPTII API SERVER (Port 5050)                          │
│  - Reserves variant stock atomically in db.transaction                      │
│  - Creates order row with payment_status: 'pending' (or sandbox 'paid')     │
│  - Flags is_simulated_payment: 1 (Sandbox) or 0 (Live)                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/payments/create-order
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT GATEWAY SERVICE (Razorpay)                       │
│  - Generates gateway order ID (e.g., order_EKwxwAgItmmXdp)                  │
│  - Stores payment_gateway_order_id in orders table                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Returns gatewayOrderId + KeyId
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CUSTOMER RAZORPAY MODAL                               │
│  - Customer authenticates with UPI PIN / 3D Secure OTP                      │
│  - Payment successfully captured at bank/processor                          │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    │ 4. Client Callback                  │ 5. Asynchronous Webhook
                    │ POST /api/payments/verify           │ POST /api/payments/webhook
                    ▼                                     ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────────┐
│       SIGNATURE VERIFICATION GUARD        │ │    WEBHOOK IDEMPOTENCY GUARD  │
│  - Recomputes HMAC-SHA256 signature       │ │  - Checks payment_webhooks    │
│  - Constant-time crypto.timingSafeEqual   │ │  - If duplicate: HTTP 200 OK  │
│  - Rejects forged/tampered parameters     │ │  - Verifies webhook HMAC sig  │
└─────────────────────┬─────────────────────┘ └───────────────┬───────────────┘
                      │                                       │
                      └───────────────────┬───────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT TRANSITION ENGINE                            │
│  - Verifies order is NOT cancelled (Guards against invalid transition)      │
│  - Verifies order is NOT already refunded                                   │
│  - Transitions payment_status to 'paid'                                     │
│  - Stores payment_gateway_ref (e.g., pay_29QQoUBi66xm2f)                   │
│  - Permanent audit log written to audit_logs                                │
│  - Glazing lab notified to begin lens blank surfacing                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Payment State Machine & Transition Invariants

The database enforces a strict state machine across `payment_status` (`pending`, `paid`, `failed`, `refunded`, `partially_refunded`) and `order_status` (`placed`, `processing`, `lab_glazing`, `shipped`, `delivered`, `cancelled`).

```
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │
             ┌─────────────┼─────────────┐
             │ Gateway     │ Payment     │ Order
             │ Capture     │ Decline     │ Cancelled
             ▼             ▼             ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │   paid    │ │  failed   │ │ cancelled │
       └─────┬─────┘ └───────────┘ └───────────┘
             │
             │ Administrative Refund
             │ or Cancellation
             ▼
       ┌───────────┐
       │ refunded  │
       └───────────┘
```

### Strict Transition Invariants Enforced in Code:

| Attempted Transition | Pre-Condition | Action / Result | Enforcement Point |
|---|---|---|---|
| **Capture on Cancelled Order** | `order_status === 'cancelled'` | **REJECTED (HTTP 400 `INVALID_PAYMENT_TRANSITION`).** A cancelled order whose stock was released must never accept payment capture. | `payments.routes.js:35`, `admin.routes.js:1196` |
| **Duplicate Capture** | `payment_status === 'paid'` | **REJECTED (HTTP 400 `PAYMENT_ALREADY_CAPTURED`).** If called via verify or webhook, returns `idempotent: true` without re-crediting. | `payments.routes.js:42`, `admin.routes.js:1205` |
| **Re-Payment of Refunded Order** | `payment_status === 'refunded'` | **REJECTED (HTTP 400 `INVALID_PAYMENT_TRANSITION`).** Refunded orders are terminal and cannot be marked as paid. | `payments.routes.js:112`, `admin.routes.js:1214` |
| **Refund of Unpaid Order** | `payment_status === 'pending'` or `'failed'` | **REJECTED (HTTP 400 `CANNOT_REFUND_UNPAID_ORDER`).** Funds cannot be refunded if they were never received. | `admin.routes.js:1232` |
| **Duplicate Refund** | `payment_status === 'refunded'` | **REJECTED (HTTP 400 `PAYMENT_ALREADY_REFUNDED`).** Prevents double refund payouts. | `admin.routes.js:1223` |
| **Cancellation of Paid Order** | `payment_status === 'paid'` | **AUTOMATIC TRANSITION:** `payment_status` $\rightarrow$ `'refunded'`, `refund_amount_inr` recorded, variant inventory restocked. | `admin.routes.js:1107` |

---

## 5. Financial Revenue Separation: Simulated vs. Real Money

A fundamental requirement of the Optii platform is that demonstration, test, or sandbox orders **must never inflate financial reporting**.

### Database Schema Columns (`orders` table):
- `is_simulated_payment`: `INTEGER NOT NULL DEFAULT 1` (`0` = Verified Real Money; `1` = Simulated Sandbox Transaction).
- `payment_gateway_name`: `TEXT` (`'razorpay'`, `'cashfree'`, `'simulated_sandbox'`, `'in_store_settlement'`).
- `payment_gateway_ref`: Unique transaction reference assigned by bank/processor.
- `refund_amount_inr`: Real-denominated refund total issued against the order.

### Financial Summary Query ([server/routes/admin.routes.js](file:///c:/Users/shafe/Desktop/Projects/optii/server/routes/admin.routes.js)):
```sql
-- Net Real Financial Revenue (Only Live, Non-Cancelled, Paid Orders)
SELECT COALESCE(SUM(total_amount_inr - COALESCE(refund_amount_inr, 0)), 0) as real_revenue
FROM orders 
WHERE (payment_status = 'paid' OR order_status = 'delivered') 
  AND order_status != 'cancelled' 
  AND is_simulated_payment = 0;

-- Sandbox / Demonstration Volume (Reported Distinctly)
SELECT COALESCE(SUM(total_amount_inr - COALESCE(refund_amount_inr, 0)), 0) as simulated_volume
FROM orders 
WHERE (payment_status = 'paid' OR order_status = 'delivered') 
  AND order_status != 'cancelled' 
  AND is_simulated_payment = 1;
```

### Admin UI Presentation ([public/admin.html](file:///c:/Users/shafe/Desktop/Projects/optii/public/admin.html)):
- **KPI Card 1: Net Real Revenue (Live):** Displays actual banking revenue received (Green).
- **KPI Card 2: Sandbox Test Volume:** Displays demonstration checkout volume (Muted Ink / Amber) with an explicit badge: *"Simulated — No live funds"*.
- **Orders Table:** Displays unmistakable status badges:
  - `[SANDBOX]` (Amber background, tooltip: *"Demonstration Sandbox — No actual funds collected"*).
  - `[LIVE]` (Green background, tooltip: *"Verified Live Gateway Transaction"*).

---

## 6. Cryptographic Security & Webhook Idempotency

### Constant-Time Signature Verification:
To prevent timing attacks that exploit string comparison speeds, Optii uses Node.js `crypto.timingSafeEqual`:
```javascript
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(`${orderId}|${paymentId}`)
  .digest('hex');

const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
const actualBuffer = Buffer.from(signature, 'utf8');

if (expectedBuffer.length !== actualBuffer.length) {
  return { valid: false, reason: 'Signature length mismatch.' };
}

const match = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
```

### Webhook Idempotency Ledger:
To defend against network retries, connection timeouts, and malicious replay attacks:
1. Every incoming webhook payload is parsed for its unique `event_id` (from `X-Razorpay-Event-Id` or payload `id`).
2. Optii queries the `payment_webhooks` table:
   ```sql
   SELECT id, status FROM payment_webhooks WHERE event_id = ?;
   ```
3. If the record exists, the server immediately returns **HTTP 200 OK** with `{ idempotent: true, message: 'Webhook event already processed' }` without re-executing stock or payment modifications.
4. If new, the event is atomically logged and processed inside a `db.transaction()` block.

---

## 7. Daily Reconciliation & Refund Procedures

### Administrative Refund Workflow:
1. Store Manager or Admin inspects order details at `/admin`.
2. For paid orders requiring refund (e.g., patient cancelled before glazing, prescription change outside manufacturing tolerance), staff clicks **Issue Full Refund**.
3. Confirmation modal prompts for confirmation.
4. API call dispatched:
   ```http
   PATCH /api/admin/orders/:orderNumber/payment
   Content-Type: application/json
   Authorization: Bearer <JWT>

   {
     "action": "refund",
     "amount_inr": 12500,
     "reason": "Prescription cancelled prior to glazing"
   }
   ```
5. Server transitions `payment_status` to `'refunded'`, records `refund_amount_inr`, and writes an immutable audit log entry.
6. If live mode is enabled, the gateway's refund endpoint (`POST /v1/payments/{payment_id}/refund`) is invoked with reverse settlement.

### Daily End-of-Day (EOD) Reconciliation Checklist:
1. Export `/api/admin/orders` filtered by `is_simulated = 0` and `date = TODAY`.
2. Reconcile total settlement against the Razorpay Merchant Dashboard:
   $$\text{Storefront Gross Captured} - \text{Refunds Issued} - \text{Gateway MDR Fees} = \text{Bank Payout Amount}$$
3. Investigate any order with `payment_status = 'pending'` older than 30 minutes; check gateway status to confirm if payment was abandoned or captured without webhook delivery.
