# DHEEHSTORE

A Next.js marketplace for Ethiopian shops, priced in ETB. It includes a PostgreSQL database, password-hashed accounts, signed HTTP-only sessions, producer approval, product listings, a multi-seller cart, seller-split checkout, order management, reviews data, and an administrator review queue. Financial features include private seller product costs, an append-only double-entry ledger, weekly seller commission collection, encrypted payout destinations, and environment-separated Chapa payment/transfer integrations.

> This is a runnable foundation for local development and further production hardening. Payment providers are not represented as live: gateway choices remain pending until a verified provider integration and credentials are configured.

## Run in Visual Studio Code

1. Install Node.js 20.9 or newer for the app. The SQLite import utility requires Node.js 22.5 or newer.
2. Open this folder in Visual Studio Code and open **Terminal → New Terminal**.
3. Copy `.env.example` to `.env`, then set the pooled and direct connection strings from a Neon development branch as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Never use the production branch for local development.
4. Set `SESSION_SECRET` to a random value of at least 32 characters and set a strong `OWNER_PASSWORD` (12+ characters including upper-case, lower-case, number, and symbol). `OWNER_EMAIL` is pinned to the designated account `aminy3815@gmail.com`.
5. Generate `BANKING_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep it private in `.env`.
6. Generate a separate random `CRON_SECRET`; configure the same value in Vercel so scheduled commission statements and reminders are authorized.
7. To test Chapa, set `CHAPA_MODE=test`, configure `CHAPA_TEST_SECRET_KEY` and `CHAPA_TEST_WEBHOOK_SECRET` from your Chapa test dashboard. Live credentials use separate variables and live payments/payouts remain disabled by default.
8. Install packages: `npm install`
9. Apply reviewed schema migrations to the development branch: `npm run db:migrate:deploy`
10. To preserve the existing SQLite records, import them once into the empty development database with `npm run db:import:sqlite -- --source prisma/dev.db`. Do not run this against a populated database.
11. Start the app: `npm run dev`
12. Open http://localhost:3000

Before applying schema updates to an existing database, make a verified backup. New product listings require a private product cost; existing listings do not receive invented cost values and must be updated by their seller before checkout.

For a brand-new empty development database instead of a SQLite import, run `npm run owner:setup` only if you intend to seed/provision the owner there.

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
| `DATABASE_URL` | Pooled Neon PostgreSQL URL for application traffic. |
| `DATABASE_URL_UNPOOLED` | Direct Neon PostgreSQL URL for Prisma migrations and the SQLite importer. |
| `SESSION_SECRET` | HMAC key for signed, HTTP-only login cookies. Set a unique random secret. |
| `APP_BASE_URL` | Public base URL used for Chapa callbacks. Use your local URL during development. |
| `OWNER_EMAIL` | Must remain `aminy3815@gmail.com`; setup refuses to provision another owner address. |
| `OWNER_PASSWORD` | Initial owner password, set privately in `.env`; never commit it. |
| `BANKING_ENCRYPTION_KEY` | 32-byte AES-256-GCM key, encoded as 64 hex characters; encrypts bank and wallet account details. |
| `CRON_SECRET` | Random bearer token for Vercel scheduled weekly commission statement and reminder jobs. |
| `CHAPA_MODE` | `test` or `live`; select the key set configured for the current environment. |
| `CHAPA_TEST_SECRET_KEY`, `CHAPA_TEST_WEBHOOK_SECRET` | Server-only Chapa test credentials; configure in local development and preview environments. |
| `CHAPA_LIVE_SECRET_KEY`, `CHAPA_LIVE_WEBHOOK_SECRET` | Server-only Chapa live credentials; configure only in the production environment after merchant approval. |
| `CHAPA_LIVE_PAYMENTS_ENABLED`, `CHAPA_LIVE_PAYOUTS_ENABLED` | Explicit production gates; both default to `false`. Keep payouts disabled until Chapa confirms transfer permission and the merchant balance/approval flow is ready. |
| `TELEBIRR_APP_KEY`, `TELEBIRR_APP_SECRET` | Reserved for a future server-side Telebirr adapter. No live calls are made. |

Never commit `.env` or place payment secrets in browser code. Change the demo passwords and secrets before deploying. Local development uses a separate Neon branch; keep the original SQLite file and its backup unchanged until the migration is verified.

## Features and routes

- `/` marketplace discovery, search, category, city and price sorting filters
- `/products/[id]` product listing and seller shop link
- `/shops` and `/shops/[slug]` approved shop directory and storefront
- `/register`, `/login` signed-in customer and producer accounts
- `/cart` multi-seller cart and checkout, with one order per seller
- `/orders` customer order history and status
- `/seller` producer listings, order/customer details, fulfilment status updates, sales summary, Weekly Commission statements, and manual payment submissions
- `/seller/banking` seller banking & payments, private balances, destination review, settlement history and withdrawal requests
- `/owner` owner-only console with overview, sellers, customers, products, orders, payments, the DHEEHSTORE Financial Center, Commission Collection, encrypted owner payment destinations, complaints, notifications, activity log, and marketplace settings
- `/support` authenticated customer complaint submission
- `/api/owner/*` routes require the designated owner role and write an administrative activity record for owner actions

Checkout decrements inventory in a database transaction per seller order and stores payment as pending. Product images accept URLs; production uploads should be connected to a trusted object-storage provider with type, size, and authorization checks. Prescription drugs and unlicensed regulated medical listings should not be enabled.

## Current scope

The owner console reads and changes real database records. New weekly commissions are calculated server-side at 3% of the discounted product selling price, excluding delivery, only after an order is both paid and delivered. Product costs remain private and are not part of this commission calculation. Historical financial ledger rows are preserved; the previous net-profit commission is not deducted from new seller settlements. Seller payment receipts remain private in PostgreSQL, and a receipt submission is never treated as proof of payment until the owner confirms the received amount. Only the owner can record an already verified customer refund; this records commission credits and does not initiate a gateway refund.

The ledger and reporting include only transactions the application can verify. Existing products and past orders are not assigned fabricated costs or balances. Refunds/chargebacks are not counted as complete without a verified refund flow; paid orders cannot be cancelled by a seller as a substitute for a refund.

## Payment and settlement

Chapa checkout initialization, server-side transaction verification, signature-checked webhooks, payout requests, payout verification, and idempotency use separate test/live credentials. Live payments and payouts require explicit environment gates; payouts remain disabled until live credentials and Chapa merchant transfer permission are confirmed. The app does not accept a customer-selected payment method as proof of payment. Weekly seller commission is collected separately by seller-initiated Telebirr, E-Birr, or bank payments to the owner's configured destination; no seller bank is debited and no automatic payment is claimed. Vercel cron invokes the protected route at 00:05 Monday and 09:00 daily in Africa/Addis_Ababa (UTC schedules); notifications are in-app only.

## Deployment notes

This Next.js app can be deployed to Vercel or another Node-compatible host, but no deployment is authorized by this implementation. Configure production environment variables, provision PostgreSQL, run reviewed Prisma migrations, and use private object storage for product media. Add HTTPS, rate limiting, email delivery, backups, logging/alerts, privacy and consumer policies, a production key-management plan, and a security/operations review before handling real customers or money.

The application uses PostgreSQL. Configure a Neon pooled `DATABASE_URL` for application traffic and a direct `DATABASE_URL_UNPOOLED` for Prisma CLI migrations. Use `npm run db:migrate:dev -- --name <migration>` against a development branch and `npm run db:migrate:deploy` only after reviewing the committed migrations. Do not use `db push` for production.

The original SQLite database is preserved as a local source and backup. To copy it, first apply the reviewed migration to an empty Neon development branch, then run `npm run db:import:sqlite -- --source prisma/dev.db`. The importer is read-only against SQLite, verifies SQLite integrity and foreign keys, refuses a non-empty PostgreSQL target, and checks copied row counts and financial ledger totals in one rollback-safe transaction. It does not delete or alter the SQLite database. Local app development uses a separate Neon development branch; never point local development or the importer at the production branch.

If payout destinations containing encrypted account details are present, keep the same `BANKING_ENCRYPTION_KEY` in the Neon environment or re-encrypt those values before switching environments. Never paste connection strings or keys into chat or commit them.
