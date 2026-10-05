# Porter — landing page feature reference

This document inventories the app's implemented features for a future landing page. It describes product capabilities, not a promise that every optional feature is enabled in a particular installation. Configuration lives in `.env.local`; setup details are in [README.md](README.md). No credentials or private guest data belong in landing page content.

## Product positioning

**Porter brings vehicle check-in, valet dispatch, parking availability, and digital guest tickets into one workflow.**

Built for hotel and business valet operations, with a desktop operations dashboard, a mobile worker station, and a compact guest ticket guests can open in their browser.

Potential hero headline: **From arrival to pickup, keep valet service moving.**

Potential supporting copy: **Check in vehicles, track lot capacity, coordinate retrieval, and give guests a digital ticket for requesting their car.**

## Feature overview

| Feature | Availability | Guest or operator benefit |
| --- | --- | --- |
| Operations dashboard | Built in | See vehicles on site, arrivals, and retrieval requests together. |
| Vehicle check-in | Built in | Capture guest, vehicle, and handoff details in one record. |
| Vehicle inventory and search | Built in | Find tickets and the information needed for retrieval. |
| Retrieval and dispatch workflow | Built in | Follow each car from parked through completed handoff. |
| Mobile worker station | Built in | Give attendants focused controls for everyday tasks. |
| Digital guest tickets | Built in | Let guests view status and request pickup from a private link. |
| Ticket QR codes | Built in | Open or download a QR code linked to the guest ticket. |
| Hotel room linking | Hotel configuration | Connect a guest's ticket to an optional room or suite label. |
| Business branding | Configurable | Use the operator's name, logo, accent color, and pickup location. |
| Parking rates | Configurable | Set transient, overnight, and monthly ticket amounts. |
| Lots and garages | Optional configuration | Track available compact, large, and handicap spots by location. |
| Vehicle and plate photos | Optional configuration | Keep visual parking records with the staff ticket. |
| Guest welcome texts | Preview or Twilio configuration | Share a branded ticket link with guest permission. |
| Online payments | Optional Stripe configuration | Offer hosted parking-fee checkout before retrieval. |
| Guest tips | Optional with online payments | Let guests choose a preset or custom tip. |
| Persistent business records | Built in | Keep tickets and saved photos across server restarts. |

## Operations dashboard

- Vehicles currently on site.
- Active retrieval requests across requested, retrieving, and ready stages.
- Today's check-ins and completed ticket value.
- Arrival activity for the last seven days.
- Retrieval queue with quick access to tickets.
- Recent vehicles and links into the employee station and inventory.
- Sample-vehicle setup for demonstrating the workflow with an empty database.

**Landing page angle:** “See your operation at a glance.”

Completed ticket value is the sum of saved ticket rates, not collected revenue or a full financial report.

## Vehicle check-in and records

- Guest name and phone number.
- Make, model, color, and license plate.
- Searchable make/model catalog with keyboard support.
- Custom make/model entry, with saved entries available as later suggestions.
- Key tag, receiving attendant, parking type, and condition notes.
- Parking-space reference, or lot and spot-type selection when lot tracking is enabled.
- Optional hotel room or suite linkage.
- Guest permission checkbox for welcome texts.
- Unique ticket number and random private guest link created on save.
- Duplicate active license plates rejected.
- Check-in forms retain unfinished work during background refreshes and dispatch actions.

**Landing page angle:** “Capture the details your team needs before the keys change hands.”

The local vehicle catalog includes 52 makes and 1,620 models in the current snapshot. It is not a complete global vehicle database, and no VIN decoding or automatic plate recognition is implemented.

## Inventory, dispatch, and retrieval

- Searchable vehicle inventory with status filters.
- Staff ticket details for guest contact, vehicle, parking reference, key tag, attendant, rate, notes, and arrival time.
- Staff can initiate pickup for a parked vehicle.
- Ordered workflow: **Parked → Requested → Retrieving → Ready for pickup → Completed**.
- Retrieval queue showing parking and key information.
- Controls to start retrieval, mark a car ready, and complete handoff.
- Background refreshes keep ticket status current.
- Invalid or stale status changes are rejected.

**Landing page angle:** “Keep every pickup moving through a clear handoff process.”

## Mobile worker station

- Dedicated browser-based worker view at `/worker`.
- Four focused tasks: **Check in, Retrieve, Vehicles, and Ready**.
- Touch-friendly vehicle cards and action controls.
- Search by plate, guest, parking reference, or key tag.
- Parking and key information visible on cards.
- Navigation between tasks and back to the action grid.
- Ticket access, parking availability, and enabled photo tools from the worker workflow.

**Landing page angle:** “Give attendants a focused station for work on the move.”

This is a mobile-friendly web experience; a native mobile app and offline operation are not implemented.

## Digital guest tickets

- Guest ticket opens through a private browser link without a guest account.
- Compact ticket layout with a permanent ticket number.
- Vehicle name, color, plate, and status grouped together.
- Stage-specific content keeps the ticket focused as pickup progresses.
- Guests request their parked vehicle from the ticket.
- Pickup progress and instructions reflect the current stage.
- Automatic status refresh every ten seconds while the page is visible.
- Configurable pickup location in guest instructions.
- Hotel room linkage when configured and recorded.
- Completion message and confirmed payment details when applicable.
- Staff-only phone numbers, parking assignments, key tags, condition notes, attendants, and photos excluded from guest responses.

**Landing page angle:** “Your guest's car, a browser link away.”

The link is a bearer credential: anyone with it can access that ticket. Do not describe it as an authenticated guest portal or guarantee a pickup time.

## Ticket QR codes

- QR thumbnail on the parked ticket and again when the car is ready for pickup.
- Larger QR modal.
- Downloadable 512 × 512 PNG.
- QR opens the ticket's private guest URL.
- QR generation happens locally without sending ticket URLs to an external QR service.

**Landing page angle:** “A digital ticket guests can keep close.”

QR codes link to tickets; a dedicated staff scanning/check-in system is not implemented.

## Parking lots and garages

- Configure multiple named lots or garages with stable IDs.
- Set compact, large, and handicap capacities separately for each location.
- Available/total counts per lot and per spot type.
- Green availability indicators and red full indicators, accompanied by text counts.
- Lot and spot-type selection during desktop and worker check-in.
- Full lots or categories disabled in check-in choices.
- Optional space or level reference to help attendants locate a car.
- Atomic server-side capacity checks prevent category overbooking.
- Parked, requested, and retrieving cars consume capacity.
- Capacity becomes available when a vehicle is marked ready for pickup.
- Notices identify legacy tickets outside configured assignments and categories over capacity after a configuration change.

**Landing page angle:** “Know what fits, and where there's room.”

Availability follows staff ticket updates, not sensors. Staff explicitly select spot type and determine handicap eligibility. Physical maps, reservations, and automatic vehicle-size classification are not implemented.

## Vehicle and license plate photos

- Optional photo tools in the staff ticket dialog.
- Separate vehicle and license plate images per ticket.
- Upload or replace images while the vehicle is parked.
- Phone-camera capture supported by the upload control on compatible devices.
- JPEG and PNG accepted, up to 5 MB per image.
- Thumbnails open the full saved image.
- Photos remain viewable after retrieval and completion.
- Images persist with the business's records and are excluded from guest tickets.

**Landing page angle:** “Keep a visual record of the parked vehicle.”

Current support is one image per category. Do not claim automatic damage detection, plate OCR, unlimited galleries, HEIC support, or a claims-management system.

## Guest welcome texts

- Preview mode saves a branded message without sending a text.
- Live welcome SMS through configured Twilio credentials.
- Guest permission recorded during check-in.
- Phone validation before live submission.
- Custom message templates containing business, guest, ticket number, ticket link, and pickup location.
- Optional public image attachment for MMS.
- Submission status visible to staff.
- Manual retry for eligible failed submissions.
- Accepted messages are not resent by repeated submissions or retries.
- Cars remain saved when message submission fails; staff can share the link manually.

**Landing page angle:** “Put the ticket link in your guest's hands.”

This is a welcome-message integration, not two-way chat or automatic ready-for-pickup texts. Provider acceptance does not confirm handset delivery; delivery callbacks and background recovery are future work.

## Parking payments and tips

- Optional USD Stripe-hosted checkout from the guest ticket.
- Configurable parking-fee requirement before guest-requested retrieval.
- Optional “Pay at valet” request path when payment is not required.
- Staff can request vehicles directly for podium payment.
- Payment amount comes from the ticket's saved rate.
- Optional tips with configurable presets and a custom amount.
- Tips are not preselected.
- Confirmed payment records the total and tip and requests retrieval.
- Signed webhook verification and return-page payment confirmation.
- One active checkout per ticket; resumed checkout retains its fee and tip.
- Payment and tip details available on staff tickets and applicable guest stages.
- Card information is handled by Stripe-hosted checkout rather than stored in the app.

**Landing page angle:** “Offer checkout and optional tipping before pickup.”

Live payments require Stripe setup and credential-specific testing. Time-based billing, taxes, refunds inside the app, staff tip payouts, and subscription billing are not implemented. Monthly is a ticket rate category, not recurring billing.

## Branding and business configuration

- Business name and app brand name.
- Logo URL and primary accent color.
- Hotel or general business mode.
- Business timezone and pickup location.
- Public guest-link URL.
- Configurable transient, overnight, and monthly rates.
- Optional photo storage, lot tracking, texting, payments, and tips.
- Separate records per business ID.

**Landing page angle:** “Shape the guest experience around your operation.”

Configuration currently uses environment settings and a server restart. Each deployment serves one business; a self-service settings screen, multi-location account management, and shared multi-tenant login are not implemented.

## Suggested landing page sections

1. **Hero:** arrival-to-pickup positioning and a product-demo call to action.
2. **Guest experience:** compact ticket, request button, pickup progress, and QR.
3. **Staff workflow:** check-in, search, dispatch, and mobile worker station.
4. **Parking availability:** lot/garage capacity split by spot type.
5. **Vehicle records:** key tags, condition notes, room linkage, and optional photos.
6. **Optional integrations:** branded welcome texts, hosted payments, and tips.
7. **Branding:** business identity, rates, and pickup-location configuration.
8. **Demo request:** invite prospects to see the workflow, without implying public signup is already built.

## Future work and claims to hold back

The app is currently a local prototype. Staff screens and APIs do not yet have authentication or role-based authorization. Before public use with real guest data, production work includes staff login/roles, rate limiting, HTTPS deployment, retention controls, audit logs, and suitable backup/hosting operations.

Keep the following out of “available now” landing page claims:

- Production security certification, compliance guarantees, or uptime guarantees.
- Live multi-property account management or employee permissions.
- Automatic plate scanning, damage detection, or vehicle-size classification.
- Sensor-based occupancy, physical parking maps, reservations, or GPS tracking.
- Pickup-time estimates, two-way messaging, or automatic ready texts.
- Native mobile apps or offline sync.
- Collected-revenue analytics, accounting exports, or advanced reporting.
- Automated refunds, tax calculations, staff gratuity payouts, or recurring billing.
- Self-service signup, pricing plans, or integrations beyond those listed above.

These are unimplemented capabilities, not committed delivery dates. Recheck the source and configuration before publishing final marketing copy.
