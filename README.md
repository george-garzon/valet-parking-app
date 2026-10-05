# Porter — Next.js valet operations MVP

A local valet app inspired by the operational features described at https://www.avpmi.com/solutions/valet/. It is independent of AVPMi and does not connect to their systems.

## Run

Requires Node.js 20.9+ and npm. PHP is no longer required.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000.

For a production build on your own Node.js server:

```sh
npm run build
npm start
```

## Structure

- `app/`: Next.js App Router page, root layout, global styles, and `/api` route handler.
- `components/`: React dashboard, searchable vehicle inventory, employee intake/dispatch, ticket dialog, and guest experience.
- `lib/db.ts`: server-only SQLite access, validation, random guest tokens, duplicate-plate handling, and atomic ticket transitions.
- `lib/types.ts`: shared TypeScript types and ticket display helpers.
- `tests/workflow.py`: integration test against the production Next.js server.

The migration retains the original SQLite table and API contract. Existing `storage/valet.sqlite` databases and `/?ticket=...` guest links continue to work when served from the same host and port. No data conversion is required.

## Views and workflow

- **Overview:** on-site counts, arrival activity, retrieval queue, recent vehicles, and today's completed ticket value. “Try sample vehicles” adds four sample records when the database is empty.
- **Vehicles:** searchable ticket inventory, filters, condition notes, parking spaces, key tags, and shareable guest links.
- **Employee station:** save guest and car information and advance requested → retrieving → ready → completed. Staff can request a parked vehicle from its ticket. Dispatch actions and background refreshes preserve unfinished check-in forms.
- **Worker view (`/worker`):** a separate touch-friendly station with four icon tiles: Check in, Retrieve, Vehicles, and Ready. No desktop header or sidebar. Each task has focused controls, searchable vehicle cards with spaces/key tags, and quick navigation back to the icon grid. Open it from the desktop employee station or directly at `/worker`.
- **Guest experience:** a random private link for each ticket; view vehicle status and request pickup. Guest pages refresh every 10 seconds and do not fetch the staff inventory.

Tickets persist in SQLite, ignored by Git. Each `BUSINESS_ID` has a separate database beneath `VALET_STORAGE` or `storage/`. The default `parkside` ID retains the original `storage/valet.sqlite` path. Other IDs use `storage/<business-id>/valet.sqlite`. Storage is outside `public/` and is never served as a web asset. Existing databases gain an optional room-number column automatically; existing tickets and guest links are preserved.

Rates default to $25 transient, $45 overnight, and $250 monthly and are configurable in cents in `.env.local`. Changes affect new tickets only. These are reference amounts, not elapsed-time calculations or payments. Completed ticket value does not represent collected revenue.

## Business settings and guest tickets

Copy `.env.example` to `.env.local` and configure the business ID/name/type, app name, logo, accent color, timezone, pickup location, rates, and public URL. Restart the server after changing environment settings. This is one business per deployment, with separate storage per business ID; it is not a shared multi-tenant login system.

`BUSINESS_TYPE=hotel` enables an optional **Room number** field in desktop and worker check-in. Linked guest tickets display **Linked to Room # 320** (or the saved room/suite label). `BUSINESS_TYPE=business` hides room fields and guest room details. Rooms can be left blank for day visitors.

The guest ticket has a QR thumbnail. Tap it to open a larger modal and download a 512×512 PNG. Its QR encodes that ticket's private guest URL; generation happens locally with no external QR service. Use the correct `PUBLIC_APP_URL` so SMS links and QR codes point to the deployed app. The QR is another form of the private ticket link, so keep it with the guest.

## Make and model catalog

`data/vehicles.json` is a checked-in snapshot of 52 common makes and 1,620 models from [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/), filtered to passenger cars, SUVs, and trucks. It includes historical models and is not a complete global catalog. Check-in uses searchable make/model dropdowns with keyboard support; choosing a different make clears the previous model. Staff can type unlisted makes/models. Saved custom entries become suggestions for that business on subsequent check-ins, including after a reload.

Check-in uses the local catalog and does not call NHTSA. To refresh it:

```sh
npm run catalog:sync
```

The importer uses three workers with bounded retries, checks the results, and atomically replaces the snapshot only after all requested makes succeed. A failed import preserves the current catalog. Review catalog changes before deploying.

## Guest text messages

`SMS_PROVIDER=preview` (default) stores a branded text preview when the vehicle is saved, without sending messages. Open a ticket to inspect the text, private link, and submission status.

For live SMS, set `SMS_PROVIDER=twilio`, Twilio account credentials and either a sender number or Messaging Service SID, and an externally reachable HTTPS `PUBLIC_APP_URL`. Staff record the guest's permission in check-in. The app then validates the phone number, saves the vehicle and its outbox entry together, and submits the text. A provider failure leaves the car saved and exposes the private link for manual sharing. `SMS_MEDIA_URL` optionally attaches a publicly accessible HTTPS image as MMS; leave it blank for text-only SMS.

Customize `SMS_TEMPLATE` using `{brand}`, `{business}`, `{guest}`, `{ticket_number}`, `{ticket_url}`, and `{pickup_location}`. The link placeholder is required. The default follows the supplied welcome → ticket number → request link → podium fallback format. `.env.example` includes hotel wording as well.

Each ticket has one welcome-message record. Concurrent submissions and retries of accepted messages do not send it twice. Failed submissions can be retried explicitly; uncertain submissions are held for provider-side verification instead of automatically resending. A process crash during submission can leave a message in `sending`; verify it in the provider console before any manual resend. **Submitted** means the provider accepted the message, not that a handset received it. Delivery callbacks and a background outbox recovery worker are not implemented.

## Scope

This remains a **local prototype**. Staff screens and API routes do not have authentication. Development and start commands bind to `127.0.0.1`. Do not expose it publicly with real guest data until staff authentication and authorization are implemented. Guest links are bearer credentials; anyone with the link can view that ticket and request retrieval. Guest responses omit phone numbers, condition notes, key tags, parking spaces, and attendant names.

SQLite requires a writable, persistent filesystem and a Node.js runtime. For serverless or multi-instance deployment, use a shared database instead of a local SQLite file.

Remaining production work includes staff login and roles, rate limiting, HTTPS, retention controls, audit logs, photo storage, SMS delivery callbacks/background recovery, and payment integration.

## Verify

```sh
npm run typecheck
npm run build
npm test
```

Unit tests check business isolation, message templates, permission/phone validation, provider request encoding with mocked network calls, duplicate-send prevention, room linkage and database upgrades, catalog integrity, and QR decoding. The Python integration test starts an isolated production server and temporary database to check creation, configured rates/branding, text previews, guest privacy, room persistence, valid/invalid transitions, pickup completion, and private storage routing. Tests never send real messages. Python 3 is needed only for the integration test.
# Guest payment and tips

Set `GUEST_PAYMENTS_ENABLED=true` to offer USD Stripe-hosted checkout when guests tap the circular **Request** button. Set `GUEST_PAYMENT_REQUIRED=true` to require the parking fee before guest retrieval, or leave it false to offer **Request now · Pay at valet**. Staff can still request vehicles directly for guests paying at the podium. Zero-fee tickets can request without a charge.

`GUEST_TIPS_ENABLED` independently controls the optional tip section within online checkout. `GUEST_TIP_PRESETS_CENTS` configures preset amounts; custom tips accept $0–$1,000. Tips are never preselected. With online payments off, guests request immediately and no online tip is collected.

Configure `PUBLIC_APP_URL` as your public HTTPS URL, `STRIPE_SECRET_KEY` (start with a test key), and `STRIPE_WEBHOOK_SECRET`. Register `/api/payments/webhook` in Stripe for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. For local testing use Stripe CLI forwarding to that endpoint. No card information is stored by this app. Payment uses the ticket's saved rate, not a browser-supplied amount. Verified settlement atomically records payment and requests the vehicle; both webhook delivery and the guest return page can settle it safely. See [Stripe fulfillment documentation](https://docs.stripe.com/checkout/fulfillment).

One active checkout per ticket prevents repeated clicks charging twice. After checkout starts, its fee and tip remain fixed when resumed; an expired session permits a fresh choice. Cancelling checkout does not request the car or mark it paid. Paid total and tip appear on the guest ticket and staff ticket details. Refunds, tax calculation, and staff gratuity payouts are handled separately in Stripe; they are not implemented in this app. Live Stripe transactions require your account configuration and end-to-end testing with your credentials.
