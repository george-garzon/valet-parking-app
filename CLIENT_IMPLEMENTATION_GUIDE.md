# Porter — client implementation and connectivity guide

A practical rollout guide for property owners, valet operators, implementation teams, and guest-facing staff. Use it with [LANDING_PAGE_FEATURES.md](LANDING_PAGE_FEATURES.md) and [README.md](README.md).

The deployment approach and acceptance criteria below are planning recommendations, not capabilities already supplied by the app. Hardware quantities, coverage, carrier performance, and costs require a property-specific assessment.

## 1. Understand the current rollout limits

Porter currently requires a working connection to its server for check-in, pickup requests, status changes, payment confirmation, and photo uploads. An open screen can contain old information after connectivity is lost.

**There is no offline queue, automatic offline synchronization, or durable local draft storage.** Do not assume an action was saved because it was entered on a device. Staff need a manual fallback for outages.

Staff screens and APIs now require individual employee PIN sessions; administrators and managers have defined employee-management permissions. The development/start commands bind to `127.0.0.1`, which only serves the host machine. A production deployment needs validation of staff access controls and protected APIs, HTTPS, appropriate guest/staff routing, monitoring, backups, and retention decisions before handling real guest data. Do not expose the prototype through a public tunnel as a client launch.

Current records use local SQLite storage. Plan one persistent application instance per business; a horizontally scaled or serverless deployment needs a different database/storage design. Deployment and recovery procedures must preserve the database, including saved photo records.

## 2. Separate staff needs from guest needs

| User | Where connectivity matters | Required access | Fallback |
| --- | --- | --- | --- |
| Podium attendant | Arrival/check-in and handoff area | Staff application and ticket records | Paper ticket and controlled key log |
| Runner | Dispatch point, parking area, return route | Worker view and current retrieval assignments | Radio/phone instructions; update at a connected station |
| Supervisor | Office/podium | Inventory, dispatch, lot counts, troubleshooting | Manual dispatch board and incident log |
| Guest | Drop-off, hotel/restaurant, pickup area | Public guest ticket; optional hosted checkout | Request help from the podium |

Guests should be able to use their own cellular data or the property's internet-only guest Wi-Fi. They should not need the staff Wi-Fi password or access to the internal valet network.

A ticket QR code opens a URL. It does not provide internet access, create an offline ticket, or let a guest reach a server running only on a valet laptop.

## 3. Choose a deployment model

### Preferred pilot model: hosted application with protected staff access

After production access controls and deployment safeguards are validated, host one business instance on a stable HTTPS domain with persistent storage and managed operations.

- Podium device connects through the property's business internet.
- Runner devices use a dedicated staff Wi-Fi network and/or cellular data.
- Guests reach the public ticket through cellular or guest Wi-Fi.
- Twilio and Stripe reach their required public endpoints.
- The database remains on the application server; staff devices do not hold the master database.

This avoids making guest access depend on a podium laptop remaining online. It still depends on both server availability and the user's internet connection.

### On-premises alternative: property-hosted application

A managed property server can serve staff over the local network. Guest access and integrations need a deliberate public HTTPS routing design and the same production access controls.

Local staff operations may continue during an internet outage **only if** devices can reach that local server, the deployment allows it, and the local network/power remain operational. External SMS, Stripe checkout, and remote guest access may still fail. This is a deployment possibility, not an implemented failover mode.

Use a managed server with persistent storage and backups, rather than an attendant's personal laptop. There is no built-in cloud/local replication or automatic failover between two application servers.

## 4. Survey the property before choosing Wi-Fi equipment

Wi-Fi at the lobby does not establish coverage at the valet curb or in the garage. Perform a walkthrough and wireless survey on the actual devices. Surveying is how network teams assess coverage, interference, and access-point placement. [Cisco site survey guidance](https://www.cisco.com/c/en/us/support/docs/wireless/5500-series-wireless-controllers/116057-site-survey-guidelines-wlan-00.html).

Test these locations:

- Valet podium and guest drop-off lane.
- Pickup waiting area, including where guests scan their QR.
- Key storage and dispatch desk.
- Every garage level used by runners.
- Ramps, stairwells, elevator exits, and doors between work zones.
- Remote lots and walking routes between them.
- Photo capture points and places where attendants mark vehicles ready.

Concrete floors, structural obstructions, parked vehicles, and environmental conditions are reasons to verify each work zone rather than infer coverage from distance alone. Record results with cars present and during a representative busy shift.

For each location, record:

| Location/level | Staff Wi-Fi | Cellular carrier/device | Ticket load | Save/status confirmation | Photo upload | Action needed |
| --- | --- | --- | --- | --- | --- | --- |
| Podium | To test | To test | To test | To test | To test | Pending |
| Garage level 1 | To test | To test | To test | To test | To test | Pending |
| Garage level 2 | To test | To test | To test | To test | To test | Pending |
| Lot A | To test | To test | To test | To test | To test | Pending |
| Pickup curb | To test | To test | To test | To test | To test | Pending |

Record timeouts, reconnections, captive-portal interruptions, and results while moving between access points. Wi-Fi bars and a speed test alone are insufficient acceptance evidence; complete real app actions and confirm them from a second connected device.

## 5. Network setup around the valet

Proposed installation approach, subject to the network contractor's survey:

- Use a wired podium connection where practical, with staff Wi-Fi for handheld devices.
- Place managed access points to cover the work zones identified by the survey.
- Prefer wired backhaul where feasible. Any wireless mesh link must also pass the garage tests.
- Specify mounting, weather exposure, power, and cabling requirements for curbside or outdoor access points.
- Use a dedicated staff network. Keep guest access separated from business traffic, as recommended in the [NIST small-business cybersecurity guide](https://www.nist.gov/system/files/documents/2019/11/14/mepnn_cybersecurity_guide_10919-508.pdf).
- Have IT configure current network security, device access, roaming, and channel planning appropriate to the installation.
- Avoid repeated captive-portal sign-in on operational staff devices.
- Verify DNS, HTTPS access, public ticket routing, and enabled service integrations from the actual networks.
- Place network equipment and the podium/server power path on suitable backup power where the property requires continuity; verify runtime under load.

Guest/staff network separation is an infrastructure task. It does not replace application authentication or protect publicly reachable staff endpoints by itself.

There is no universal “one router per garage” or “one access point per floor” rule. Obtain the equipment count after surveying coverage and expected concurrent device usage.

## 6. Decide how runners work in weak-coverage garages

### Option A: continuous staff Wi-Fi coverage

Best when runners need to check tickets, update statuses, and upload images from all operating areas. Install and validate coverage on the actual routes before promising this workflow.

### Option B: cellular-backed runner devices

Useful when a tested carrier has reliable coverage where Wi-Fi is weak. Test each carrier/device combination on every level, not just at the garage entrance. Underground spaces may have no usable cellular service.

Switching between Wi-Fi and cellular does not prove a request completed. After switching, refresh and verify the ticket before retrying a mutation.

### Option C: connected work zones with radio dispatch

A realistic initial workflow when full garage coverage is impractical:

1. Check in the vehicle and save its assignment at the connected podium.
2. Give the runner the ticket, vehicle, key tag, lot, and space reference through the property's approved dispatch procedure.
3. Use radio/phone communication in disconnected areas; do not operate the phone while driving.
4. Record or confirm progress from a connected station when the runner returns or radios in.
5. Explain that guest progress and lot availability reflect the last confirmed server update.

This is a manual operating model, not offline app support. Photos can be captured with an approved device camera and uploaded after reconnecting while the ticket is still parked; confirm both uploads before advancing its status. Define how temporary device photos are removed under the property's retention policy.

If the business requires live updates everywhere and neither Wi-Fi nor cellular passes testing, improve coverage before launch or narrow the operating area.

## 7. Staff device and bandwidth planning

- Start the pilot with a podium computer/tablet and enough managed runner devices for the active team, plus a charged spare.
- Validate the actual browsers, touch controls, camera permissions, and image formats on the chosen devices.
- The photo feature accepts JPEG/PNG, up to 5 MB per image; HEIC requires conversion.
- Provide charging, protective cases, screen-lock rules, and an owner for lost-device response.
- Confirm staff can reach the app after reconnecting or changing networks.
- Test at expected peak concurrency; the app currently refreshes tickets periodically rather than pushing every change instantly.

Photo uploads deserve a separate test. A 5 MB image contains roughly 40 megabits; at 1 Mbps of usable upload speed it takes about 40 seconds before protocol overhead and retries. Two photos can make slow connections noticeably disruptive. Test the largest permitted images and choose a practical capture size that keeps plates readable without unnecessary file size.

Do not advertise a required bandwidth, supported device count, or upload-time guarantee until measured on the deployed system.

## 8. Configure the client's operation

Use deployment settings rather than copying one property's private configuration to another.

| Setting | Client decision |
| --- | --- |
| `BUSINESS_ID` | Stable unique identifier for the business's records |
| `BUSINESS_NAME`, `APP_BRAND_NAME`, logo/accent | Guest-facing identity |
| `BUSINESS_TYPE` | Hotel room linkage or general business mode |
| `BUSINESS_TIMEZONE` | Correct operating timezone |
| `VALET_PICKUP_LOCATION` | Clear guest-facing meeting point |
| `PUBLIC_APP_URL` | Public HTTPS URL guests can reach outside staff Wi-Fi |
| Parking rates | Approved transient, overnight, monthly ticket amounts |
| `PARKING_LOTS_ENABLED`, `PARKING_LOTS` | Actual lot/garage IDs, names, compact/large/handicap counts |
| `VEHICLE_PHOTOS_ENABLED` | Whether staff capture car and plate images |
| SMS provider/template | Preview first; configured live provider and guest-permission procedure |
| Payment and tip settings | Test first; optional versus required parking-fee checkout |

Keep credentials server-side and out of client handouts. Settings currently require a server restart.

For lot capacity, count usable spots with property management, keep lot IDs stable, and explain that **Ready for pickup** releases capacity. Staff must not mark cars ready while they still occupy a counted garage spot. Old tickets without lot assignments are excluded from counts; clear or reconcile them before relying on availability at launch.

Agree on who may use handicap spaces and how staff verify eligibility. The app records the selection and capacity; it does not decide eligibility.

### Set up employee access

Run `npm run staff:create-admin -- owner-admin "Owner Name"` on the configured deployment before the pilot. Record the generated PIN securely, sign in, and open **Employees**. Administrators manage all roles; managers create and manage attendants. Assign a unique employee ID and privately share the generated PIN with each staff member. Never put PINs in paper guest tickets or shared shift notes.

Test attendant restrictions, manager restrictions, PIN reset, deactivation, and sign-out on a shared device. Check receiving-attendant attribution on new tickets. Eight-hour sessions do not replace a shift handoff: staff should select **Lock / sign out** before leaving a device. PIN resets and role/access changes revoke that user's sessions. Sign-in requires server connectivity; use paper supplies during outages.

## 9. Guest arrival and pickup procedure

1. Staff confirm the saved ticket, vehicle details, key tag, and parking assignment.
2. Share the private ticket link by enabled SMS or the current manual method.
3. Explain: “Open your ticket when you're ready and tap Request vehicle. If you can't connect, ask at the valet podium.”
4. Guests can use cellular data or guest Wi-Fi; staff never disclose the business network password.
5. If checkout is enabled, guests follow the hosted payment flow and staff rely on verified payment status.
6. At handoff, staff confirm the vehicle and guest ticket under the property's procedure, then complete the ticket.

Do not promise automatic ready text messages, a live pickup ETA, or offline QR access. The current app provides ticket-page status refreshes; SMS is a welcome-ticket message.

### Prepare physical tickets before outages

Use **Print two-part ticket** on a saved staff ticket. Cut on the dashed line, keep the podium half with the keys, and give the matching guest half to the customer. The guest QR opens the saved online ticket when connectivity is available. Use the printed number and vehicle details for the property's manual handoff procedure when it is not.

Use **Print 5 blank fallback tickets** in check-in to prepare an outage supply. Print on A4/Letter paper or save the self-contained HTML to approved staff storage before connectivity is lost. Test the actual browser/printer, margins, cut line, readable numbers, and QR scan in the pilot. This uses the standard print dialog; it does not integrate a thermal cutter or confirm physical print success.

Every blank pair has a paper `OFF-...` reference, not a saved online ticket. Staff fill both halves, track parking capacity manually, and retain the key half for reconciliation. When service returns, search for any already-saved vehicle, create only missing tickets, and record the paper reference in the digital notes. Saved batches repeat their references when reprinted; manage inventory so no reference is issued twice. Do not promise offline synchronization.

## 10. Outage and uncertain-action playbook

| Situation | Immediate response | Recovery check |
| --- | --- | --- |
| One runner loses connection | Move to a connected zone or use approved radio dispatch | Refresh and confirm the latest assignment before continuing |
| Wi-Fi fails but internet/cellular is available | Use the tested backup connection | Confirm the app is reachable and the ticket reflects the last action |
| Property internet fails with a hosted app | Switch the podium/network to tested backup internet, or use manual tickets | Confirm staff and guest access; reconcile manual records |
| Server or local network is unavailable | Use numbered paper tickets, key log, and supervisor dispatch | Restore service and reconcile each vehicle once |
| Check-in times out | Search by plate from a connected device | If saved, use that ticket; otherwise create it once after reconciliation |
| Retrieval/status change times out | Refresh the ticket before repeating the action | Use the server's current stage to decide the next step |
| Photo upload fails | Verify the saved thumbnail before replacing/retrying | Confirm both images belong to the correct ticket |
| SMS submission is uncertain | Share the link manually; hold automatic resend | Check the provider and message status before retrying |
| Payment is uncertain | Do not charge again solely because a browser timed out | Check Stripe and verified ticket status; escalate unresolved discrepancies |
| Guest cannot load the ticket | Help at the podium using the staff record | Confirm vehicle and guest identity under property policy |

During manual mode, maintain ticket/reference number, guest/contact details as necessary, plate, vehicle, lot/space, key tag, stage/time, attendant, and payment reference. Store paper records securely.

Assign one supervisor to reconcile the backlog after restoration. Check for records already created, enter missing records once, complete verified stages, and reconcile parking capacity, keys, messages, and payments. Never treat stale screen counts as a physical occupancy count during an outage.

Backup connectivity only addresses the path it covers. Cellular backup at the podium does not fix a server outage, a garage dead zone, or a runner's depleted battery.

## 11. Pilot acceptance tests

Agree on property-specific targets before testing. For example, a team could set a connected-zone goal of an ordinary ticket action confirming within two seconds during normal service; this is a proposed goal, not a measured product guarantee. Establish a separate photo-upload target.

- [ ] Production access controls protect staff screens, ticket inventory, and photo APIs.
- [ ] Guests can reach only intended guest flows from cellular and guest Wi-Fi.
- [ ] Public ticket URLs work off the property's network.
- [ ] Check-in, search, request, retrieval, ready, and completion work on every approved device.
- [ ] Representative walking routes and access-point transitions pass the coverage plan.
- [ ] Concurrent check-ins cannot exceed a lot/category's capacity.
- [ ] Photos save and reopen from a second staff device without appearing on guest tickets.
- [ ] Guest SMS permission and provider failure procedures are understood.
- [ ] Enabled payment flows pass test-mode success, cancellation, delay, and verification checks.
- [ ] Staff can identify uncertain writes and avoid duplicate tickets or charges.
- [ ] A controlled connectivity-loss drill demonstrates the manual workflow and reconciliation.
- [ ] Backups are taken and successfully restored into an isolated test environment.
- [ ] Power, spare-device, and backup-internet arrangements pass a practical drill.
- [ ] Staff and property IT approve the operating procedures and known coverage limits.

Do not go live in a required work zone that fails these tests without an agreed manual alternative.

## 12. Rollout ownership and sequence

| Owner | Responsibility |
| --- | --- |
| Property management | Approve operating areas, capacities, equipment access, and guest procedures |
| Property IT/network installer | Survey, cabling, Wi-Fi, segmentation, internet backup, device connectivity |
| Application implementation team | Production readiness, hosting, business configuration, integrations, backups, application incidents |
| Valet supervisor | Training, shift coverage, keys, status discipline, outages, reconciliation |
| Client payment/SMS owner | Provider accounts, credentials, transaction/message issue escalation |

Recommended sequence:

1. Walk the property and document the operating zones and existing infrastructure.
2. Create the initial administrator, add employee accounts, validate access controls, and choose hosting/storage operations.
3. Survey connectivity and install or adjust network coverage.
4. Configure branding, rates, actual capacities, and optional features.
5. Test with demonstration data and provider test/preview modes.
6. Train a small team and run a supervised pilot in the approved zones.
7. Conduct an outage drill, fix failures, and sign off acceptance tests.
8. Expand to normal shifts with a named support contact and incident procedure.

Network equipment, cabling labor, carrier plans, device purchases, hosting, backup storage, SMS/MMS, and payment processing are separate implementation cost categories. Obtain site-specific quotes; this document does not establish a client price or installation timeline.
