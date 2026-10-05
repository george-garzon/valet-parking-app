# Porter — Next.js valet operations MVP

A local valet app inspired by the operational features described at https://www.avpmi.com/solutions/valet/. It is independent of AVPMi and does not connect to their systems.

For the full product feature inventory and future landing page content, see [LANDING_PAGE_FEATURES.md](LANDING_PAGE_FEATURES.md).

For client rollout, networking, garage coverage, and outage procedures, see [CLIENT_IMPLEMENTATION_GUIDE.md](CLIENT_IMPLEMENTATION_GUIDE.md).

## Run

Requires Node.js 20.9+ and npm. PHP is no longer required.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000.

If `/api` fails with `ERR_DLOPEN_FAILED` and an incompatible architecture error,
`better-sqlite3` was installed using a different Node architecture or version.
Stop the dev server, select the Node installation you intend to use, then rebuild
the native dependency in that same terminal:

```sh
node -p 'process.version + " " + process.arch'
npm install
npm rebuild better-sqlite3
npm run dev
```

On Apple Silicon, use an `arm64` Node installation consistently for installation
and development. If you manage Node with nvm, run `nvm use 24` first (or
`nvm install 24` if needed). Rebuild again after switching Node versions or
architectures. This preserves your SQLite data and environment settings.

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
- **Guest experience:** a compact digital valet ticket with vehicle details and status in one row, a permanent ticket number, and no car illustration. Parked tickets show guest/rate details and the request action; requested/retrieving stages focus on progress and pickup instructions; ready tickets restore the QR for pickup; collected tickets show the completion message and any payment receipt. Checkout hides the progress and duplicate ticket details. A random private link for each ticket; view vehicle status and request pickup. Guest pages refresh every 10 seconds and do not fetch the staff inventory.

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

This remains a **local prototype**. Staff screens and APIs require role-aware employee PIN sessions. Development and start commands bind to `127.0.0.1`. Before public use with real guest data, validate HTTPS deployment, access controls, backups, and remaining production safeguards. Guest links are bearer credentials; anyone with the link can view that ticket and request retrieval. Guest responses omit phone numbers, condition notes, key tags, parking spaces, and attendant names.

SQLite requires a writable, persistent filesystem and a Node.js runtime. For serverless or multi-instance deployment, use a shared database instead of a local SQLite file.

Remaining production work includes MFA/idle locking, broader rate limiting, HTTPS operations, retention controls, full ticket audit logs, photo retention controls, SMS delivery callbacks/background recovery, and live payment validation.

## Verify

```sh
npm run typecheck
npm run build
npm test
```

Unit tests check business isolation, message templates, permission/phone validation, provider request encoding with mocked network calls, duplicate-send prevention, room linkage and database upgrades, catalog integrity, and QR decoding. The Python integration test starts an isolated production server and temporary database to check creation, configured rates/branding, text previews, guest privacy, room persistence, valid/invalid transitions, pickup completion, and private storage routing. Tests never send real messages. Python 3 is needed only for the integration test.
# Guest payment and tips

Set `GUEST_PAYMENTS_ENABLED=true` to offer USD Stripe-hosted checkout when guests tap **Request vehicle**. Set `GUEST_PAYMENT_REQUIRED=true` to require the parking fee before guest retrieval, or leave it false to offer **Request now · Pay at valet**. Staff can still request vehicles directly for guests paying at the podium. Zero-fee tickets can request without a charge.

`GUEST_TIPS_ENABLED` independently controls the optional tip section within online checkout. `GUEST_TIP_PRESETS_CENTS` configures preset amounts; custom tips accept $0–$1,000. Tips are never preselected. With online payments off, guests request immediately and no online tip is collected.

Configure `PUBLIC_APP_URL` as your public HTTPS URL, `STRIPE_SECRET_KEY` (start with a test key), and `STRIPE_WEBHOOK_SECRET`. Register `/api/payments/webhook` in Stripe for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. For local testing use Stripe CLI forwarding to that endpoint. No card information is stored by this app. Payment uses the ticket's saved rate, not a browser-supplied amount. Verified settlement atomically records payment and requests the vehicle; both webhook delivery and the guest return page can settle it safely. See [Stripe fulfillment documentation](https://docs.stripe.com/checkout/fulfillment).

One active checkout per ticket prevents repeated clicks charging twice. After checkout starts, its fee and tip remain fixed when resumed; an expired session permits a fresh choice. Cancelling checkout does not request the car or mark it paid. Paid total and tip appear on the guest ticket and staff ticket details. Refunds, tax calculation, and staff gratuity payouts are handled separately in Stripe; they are not implemented in this app. Live Stripe transactions require your account configuration and end-to-end testing with your credentials.

## Vehicle and license plate photos

Set `VEHICLE_PHOTOS_ENABLED=true` in `.env.local` and restart. Open a saved ticket from the desktop or worker vehicle list (the ticket also opens after check-in). While its status is **Parked**, staff can add or replace one **Vehicle** photo and one **License plate** photo, including using a phone camera. Each image must be JPEG or PNG, up to 5 MB; convert HEIC images before uploading. Select a saved thumbnail to open the full image. Photos remain viewable through retrieval and completion, but can only be changed while parked.

Photos persist as binary records in the business's SQLite database, outside `public/`, and are excluded from guest tickets. Turning the feature off hides photos and disables their API without deleting saved records. Include the database in backups; images increase its size. Photo endpoints require staff sign-in; retention controls and deployment safeguards still need production validation.

## Parking lots and garages

Enable `PARKING_LOTS_ENABLED=true` in `.env.local` and define any number of lots or garages:

```dotenv
PARKING_LOTS_ENABLED=true
PARKING_LOTS='[{"id":"lot-a","name":"Lot A","compact":20,"large":10,"handicap":2},{"id":"garage-b","name":"Garage B","compact":30,"large":15,"handicap":4}]'
```

Each entry needs a unique lowercase slug `id`, a display `name`, and nonnegative integer capacities for `compact`, `large`, and `handicap` (zero disables that category; at least one spot per lot). Add entries for more lots or garages. Use your actual capacities: the local configuration includes example Lot A, Lot B, and Garage C counts. Restart after changes. The former `PARKING_MAP_ENABLED` / `PARKING_MAP_ROWS` settings are replaced by these lot settings.

Desktop and worker **Vehicles** screens show available/total counts per lot and spot type, green when capacity remains and red when full. Check-in requires a lot and spot type, displays remaining capacity, disables full options, and allows an optional space/level reference for retrieval. Staff choose the appropriate type explicitly, including handicap spaces; the app does not infer eligibility from a vehicle. Capacity is checked atomically on the server so concurrent check-ins cannot overbook a category.

**Parked**, **Requested**, and **Retrieving** vehicles occupy their selected category. **Ready for pickup** frees capacity because the car has moved to the pickup area. Availability refreshes with tickets. Keep lot IDs stable when renaming lots so assignments continue counting; lowering capacity below current occupancy displays an over-capacity notice and blocks new assignments until space frees up.

Existing tickets and free-text space references remain intact. Legacy tickets without lot/type assignments, or tickets whose lot was removed, display an excluded-vehicle notice; their occupancy is not guessed. When lot tracking is disabled, check-in uses the original required free-text parking space field. Lot assignments are staff-only and excluded from guest responses.

## Physical two-part tickets and outage supplies

Open any saved staff ticket and choose **Print two-part ticket**. This opens a separate print view with matching ticket numbers and a dashed cut line:

- **Podium / key copy:** keep with the keys. Includes guest/contact, vehicle, parking reference, key tag, attendant, arrival, rate, notes, and writable handoff/payment fields.
- **Guest claim ticket:** give to the guest. Includes the matching ticket number, vehicle, arrival, fee, optional hotel room, pickup location, and QR/private link. Staff contact and retrieval details are excluded from this half.

Select **Print ticket** to use the browser/operating-system printer dialog. Use a connected printer, A4 or Letter paper in portrait, 100% scale, and disable browser headers/footers. Review the preview, especially for long notes; printer margins and pagination vary. Cut the two halves apart. Printing is manual and does not change status or confirm payment. Reprints retain the original ticket number. Direct silent printing, automatic cutting, and dedicated thermal-printer layouts are not implemented.

Desktop and worker check-in offer **Print 5 blank fallback tickets**. Each page has a matching pair of unique `OFF-...` paper references and writable vehicle, guest, key, parking, and handoff fields. Print supplies **before** an outage. These references are not database tickets and have no guest QR; guests request pickup at the podium. After service returns, search for already-saved vehicles, create only missing digital records, and record the paper reference in their condition/arrival notes for reconciliation.

The print view also offers **Save printable HTML**. QR images and styles are embedded, so the downloaded file can be reopened and printed without connectivity. It contains private staff information and, for saved tickets, a private guest link: use approved staff storage and retention. Reopening/reprinting a saved blank batch repeats its references; do not issue duplicate paper numbers. An already-open app cannot generate new print views during an outage unless the server remains reachable. The guest QR still needs a connection to open the digital ticket. Browser printing does not report physical printer success to the app; staff must check the output.

## Staff accounts, roles, and PIN sign-in

Staff sign-in is required for the dashboard, worker station, ticket inventory, check-in, dispatch changes, text retries, parking photos, printed staff tickets, and employee management. Guest ticket links, guest retrieval/payment actions, and Stripe's signed webhook remain separate from staff sign-in.

Create the **first administrator** from the project directory after setting up `.env.local`:

```sh
npm run staff:create-admin -- owner-admin "Owner Name"
```

The command uses that deployment's business/storage settings, creates an administrator only when no staff accounts exist, and prints a randomly generated **8-digit PIN once**. Record it securely; there is no default or shared PIN. Sign in with the employee ID and PIN, then open **Employees** from the staff bar to add users.

| Role | Valet operations | Employee management |
| --- | --- | --- |
| Administrator | All staff ticket workflows and dashboard | Create all roles, reset PINs, change roles, deactivate/reactivate accounts |
| Manager | All staff ticket workflows and dashboard | Create attendants; reset their PINs and deactivate/reactivate them |
| Attendant | Worker check-in, inventory, retrieval, photos, and printing | No employee management |

Attendants enter the worker station by default. All staff roles can read operational ticket details needed to perform valet work; these roles do not implement per-ticket ownership or separate financial-data permissions. Receiving attendant on new tickets comes from the signed-in employee, rather than a browser-supplied name.

Employee IDs are unique within a business and case-insensitive. New-user and reset flows generate a PIN displayed only in the immediate result; PINs cannot be retrieved later. Share each PIN privately. Managers cannot create administrators/managers or promote attendants. You cannot deactivate yourself or change your own role; the service also protects the last active administrator. Deactivation preserves historical records.

PINs use salted scrypt hashes. Server sessions use random tokens, store token hashes, expire after **8 hours**, and use HttpOnly / SameSite Strict cookies (Secure on HTTPS deployments). Staff mutations check the request Origin. Configure `PUBLIC_APP_URL` for the actual public HTTPS origin behind a reverse proxy; leave it blank for localhost development. PIN reset, role change, and account activation changes revoke that employee's sessions. **Lock / sign out** ends the current device's session. Session checks run on focus and periodically; staff API permissions are checked on every request.

Sign-in allows five verification attempts per employee ID in a 15-minute window and has a business-wide ceiling of 100 attempts per minute. Successful sign-in clears the employee's attempt count. Limits persist in SQLite. If a PIN is lost, use the permitted administrator/manager reset flow. For administrator recovery by an authorized operator with access to the server:

```sh
npm run staff:reset-pin -- owner-admin
```

This local command resets an existing active account, shows the new PIN once, clears its employee-specific attempt limit, and revokes its sessions. Protect server access and database backups: local operators can reset credentials. Staff creation, changes, PIN resets, and successful sign-ins record basic access events in `staff_audit`; a full ticket/action audit interface is not implemented.

Authentication and session decisions use the [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) as references. PIN-only sign-in is intended for controlled staff devices and requires HTTPS for real deployments. MFA, SSO, automatic idle locking, broad API abuse limits, and independent production security review remain future work. A generated PIN does not provide offline authentication or offline synchronization; preprint fallback supplies before an outage.
