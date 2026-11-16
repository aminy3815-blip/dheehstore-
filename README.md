# DHEEHSTORE

A Next.js marketplace for Ethiopian shops, priced in ETB. It includes a relational database, password-hashed accounts, signed HTTP-only sessions, producer approval, product listings, a multi-seller cart, seller-split checkout, order management, reviews data, and an administrator review queue. Financial features include private seller product costs, an append-only double-entry ledger, net-profit commission accounting, encrypted payout destinations, and Chapa test-mode payment/transfer integrations.

> This is a runnable foundation for local development and further production hardening. Payment providers are not represented as live: gateway choices remain pending until a verified provider integration and credentials are configured.

## Run in Visual Studio Code

1. Install Node.js 20.9 or newer.
2. Open this folder in Visual Studio Code and open **Terminal → New Terminal**.
3. Copy `.env.example` to `.env`. Set `SESSION_SECRET` to a random value of at least 32 characters and set a strong `OWNER_PASSWORD` (12+ characters including upper-case, lower-case, number, and symbol). `OWNER_EMAIL` is pinned to the designated account `aminy3815@gmail.com`.
4. Generate `BANKING_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep it private in `.env`.
5. To test Chapa, configure a **test-mode** `CHASECK_TEST-...` secret key and a webhook secret from your Chapa test dashboard. Live secret keys are rejected by this build.
6. Install packages: `npm install`
7. Create the local database: `npm run db:push`
8. Load sample categories, shops, and listings and provision the designated owner: `npm run owner:setup`
9. Start the app: `npm run dev`
10. Open http://localhost:3000

Before applying schema updates to an existing database, make a verified backup. New product listings require a private product cost; existing listings do not receive invented cost values and must be updated by their seller before checkout.

VS Code can also open the folder directly from its File menu. Use `npm run build` and `npm start` for a production build and local production server.

## Demo accounts

Seeded producer demo accounts use the password `Demo1234!`:

- `coffee@demo.dheehstore.local`
- `craft@demo.dheehstore.local`
- `home@demo.dheehstore.local`

The demo shops and listings are explicitly demonstration data; they are not real verified businesses. The demo shops are approved for exercising seller tools. Do not deploy these demo passwords publicly.

The owner is only provisioned by the protected seed/setup process. The source contains the designated email, but the password comes from the ignored `.env` file and is stored only as a bcrypt hash. Public registration accepts only customer or producer roles. Running `npm run owner:setup` applies the current `OWNER_PASSWORD` to the designated account, including when resetting a forgotten password. After setup, sign in with the designated address, then change the password from **Owner → Marketplace settings**. Never commit `.env` or share the owner password.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma database URL. Defaults to local SQLite (`file:./dev.db`) for easy Visual Studio Code setup. |
| `SESSION_SECRET` | HMAC key for signed, HTTP-only login cookies. Set a unique random secret. |
| `APP_BASE_URL` | Public base URL used for Chapa callbacks. Use your local URL during development. |
| `OWNER_EMAIL` | Must remain `aminy3815@gmail.com`; setup refuses to provision another owner address. |
| `OWNER_PASSWORD` | Initial owner password, set privately in `.env`; never commit it. |
| `BANKING_ENCRYPTION_KEY` | 32-byte AES-256-GCM key, encoded as 64 hex characters; encrypts bank and wallet account details. |
| `CHAPA_SECRET_KEY` | Server-only Chapa test-mode secret beginning `CHASECK_TEST-`; live keys are refused. |
| `CHAPA_WEBHOOK_SECRET` | Random webhook secret configured in the Chapa test dashboard; used to verify `x-chapa-signature`. |
| `TELEBIRR_APP_KEY`, `TELEBIRR_APP_SECRET` | Reserved for a future server-side Telebirr adapter. No live calls are made. |

Never commit `.env` or place payment secrets in browser code. Change the demo passwords and secrets before deploying. SQLite is convenient for local development; use PostgreSQL for a concurrent production deployment and update the Prisma datasource/provider and connection configuration accordingly.

## Features and routes

- `/` marketplace discovery, search, category, city and price sorting filters
- `/products/[id]` product listing and seller shop link
- `/shops` and `/shops/[slug]` approved shop directory and storefront
- `/register`, `/login` signed-in customer and producer accounts
- `/cart` multi-seller cart and checkout, with one order per seller
- `/orders` customer order history and status
- `/seller` producer listings, order/customer details, fulfilment status updates and sales summary
- `/seller/banking` seller banking & payments, private balances, destination review, settlement history and withdrawal requests
- `/owner` owner-only console with overview, sellers, customers, products, orders, payments, the DHEEHSTORE Financial Center, commission settings, complaints, notifications, activity log, and marketplace settings
- `/support` authenticated customer complaint submission
- `/api/owner/*` routes require the designated owner role and write an administrative activity record for owner actions

Checkout decrements inventory in a database transaction per seller order and stores payment as pending. Product images accept URLs; production uploads should be connected to a trusted object-storage provider with type, size, and authorization checks. Prescription drugs and unlicensed regulated medical listings should not be enabled.

## Current scope

The owner console reads and changes real database records. Financial commissions are calculated server-side from paid item revenue less the seller's private snapshotted product cost; the configurable default rate is 3%, and non-positive profit is never charged. Seller balances remain pending until order delivery. COD orders record commission receivable rather than pretending that marketplace funds were received. Product costs are not returned by public product queries. Banking destinations are encrypted and masked; the owner reviews destinations because the Chapa documentation does not describe an automated account-ownership verification API.

The ledger and reporting include only transactions the application can verify. Existing products and past orders are not assigned fabricated costs or balances. Refunds/chargebacks are not counted as complete without a verified refund flow; paid orders cannot be cancelled by a seller as a substitute for a refund.

## Payment and settlement

Chapa checkout initialization, server-side transaction verification, signature-checked webhooks, payout requests, payout verification, and idempotency are implemented for test-mode credentials. The app does not accept a customer-selected payment method as proof of payment. Seller net-profit commission is calculated in the internal ledger; Chapa's documented subaccount split is percentage-of-transaction/settlement, not percentage-of-net-profit, so it is intentionally not used for commission. Transfers may require provider approval/OTP and can remain queued; balances stay reserved until a verified final payout result. Chapa's own transfer API requires sufficient merchant balance. Telebirr, Stripe, and independent E-Birr API integrations are not enabled; supported bank/wallet destinations are constrained to Chapa's current bank-list response.

## Deployment notes

This Next.js app can be deployed to Vercel or another Node-compatible host, but no deployment is authorized by this implementation. Configure production environment variables, provision PostgreSQL, run reviewed Prisma migrations, and use private object storage for product media. Add HTTPS, rate limiting, email delivery, backups, logging/alerts, privacy and consumer policies, a production key-management plan, and a security/operations review before handling real customers or money. The Chapa integration is deliberately sandbox-only.

The local development database uses `prisma db push` to create its schema. To use migration history in a deployed environment, switch to PostgreSQL and initialize migrations with `npx prisma migrate dev --name init`, then commit the generated `prisma/migrations` directory.
