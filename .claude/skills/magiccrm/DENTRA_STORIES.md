# DentraCRM - Feature Stories

## Patient Journey Flow

```
LEAD → PATIENT → APPOINTMENT BOOKED →
  ├── CONFIRMED → Patient Visits → VISITED (moves to Visited Tab)
  ├── DNR (with confirmation dialog)
  ├── TWC (Will Call Back)
  └── LOST

VISITED TAB →
  ├── Customer Agrees Treatment → TREATMENT_STARTED (moves to Treatment Tab)
  ├── Customer Denies Treatment → LOST
  ├── DNR (with confirmation dialog)
  ├── Follow-up → Schedule new appointment (stays in Visited)
  └── LOST

TREATMENT TAB →
  ├── Schedule treatment appointment
  ├── Reschedule appointment
  ├── Mark Visited (after treatment visit) → Update notes → Schedule again
  ├── DNR (with confirmation dialog)
  └── Complete Treatment (final status)
```

---

## Story 1: Schema - Add Last Contact Date & New Lead Statuses

**Size:** Medium | **Priority:** 1 | **Dependencies:** None (foundation for all other stories)

```
SCHEMA CHANGES:

1. Add "lastContactDate" (DateTime, optional) to Lead model in Prisma.

2. Ensure these lead statuses exist in the enum:
   - NEW, ATTEMPTING, CONNECTED, APPOINTMENT_BOOKED, CONFIRMED,
     VISITED, TREATMENT_STARTED, TREATMENT_DENIED, FOLLOW_UP,
     COMPLETED, LOST, DNA, DNC, DNR, TWC, RESCHEDULED

3. Run Prisma migration.

4. Update all backend endpoints that modify a lead or its appointments
   to also set lastContactDate = new Date() on the lead:
   - POST /leads (create)
   - PATCH /leads/:id (update status, notes, etc.)
   - POST /leads/:id/notes (add note)
   - POST /appointments (create appointment)
   - PATCH /appointments/:id (status change, reschedule)
   - PATCH /appointments/:id/treatment-plan (treatment update)

5. lastContactDate must be returned in all lead API responses.

6. Display lastContactDate on:
   - LeadCard (admin & lead user)
   - StaffDashboard (clinic staff)
   - All new tabs (Visited, Treatment)
   - Format in IST using existing formatDateIST utility
```

---

## Story 2: UI Label Changes

**Size:** Small | **Priority:** 2 | **Dependencies:** None

```
LABEL CHANGES ACROSS ENTIRE APP:

1. "Completed" → "Visited" everywhere:
   - StaffDashboard status buttons
   - AppointmentsPage status filters and cards
   - LeadCard appointment badges
   - All dropdowns, filters, pills
   - Database enum stays COMPLETED, only UI label changes

2. "No Show" → "Lost" at clinic level (StaffDashboard):
   - When clinic staff clicks "Lost", internally:
     - Appointment status → NO_SHOW
     - Lead status → LOST
   - Admin/Lead user sees lead as LOST, appointment as NO_SHOW

3. Remove "ATTEMPTING" from quick status buttons on LeadCard
   (admin & lead user views). Keep it in system, remove from
   quick action only.

4. Phone number font increase across all pages:
   - Use text-lg font-semibold on all phone number displays
   - Must be clickable tel: link for click-to-call
   - Apply to: LeadCard, StaffDashboard, Visited tab, Treatment tab,
     appointment cards, any list/table showing phone numbers

Apply all label changes at all levels: Admin, Lead User, Clinic Staff.
```

---

## Story 3: DNR Confirmation Dialog

**Size:** Medium | **Priority:** 3 | **Dependencies:** None

```
When ANY user (Admin, Lead User, Clinic Staff) clicks DNR on a
lead or appointment from ANY page/tab, show a confirmation modal:

Title: "Move to DNR"
Message: "This customer will be moved to DNR (Do Not Return).
Do you want to move now or make some changes first?"

Buttons:
- "Yes, Move to DNR" → proceeds with DNR status change
- "No, Go Back" → cancels, returns to current view

Create this as a REUSABLE component (DNRConfirmDialog) since it
will be used on:
- LeadCard (admin & lead user quick status)
- StaffDashboard (clinic staff appointment actions)
- Visited Tab (action on visited patient)
- Treatment Tab (action on treatment patient)

After DNR confirmed:
- Lead status → DNR
- Appointment status → DNR (if active appointment exists)
- Update lastContactDate
- Patient removed from Visited/Treatment tab
- Syncs to all user levels
```

---

## Story 4: Clinic <-> Admin <-> Lead Full Sync

**Size:** Medium | **Priority:** 4 | **Dependencies:** Story 1 (lastContactDate field)

```
CORE RULE: Any change at ANY level must update the database and
be visible to ALL other users on next refresh.

APPOINTMENT STATUS → LEAD STATUS SYNC:
- Clinic marks "Visited" (COMPLETED) → lead = VISITED
- Clinic marks "Lost" (NO_SHOW) → lead = LOST
- Clinic marks "Rescheduled" → lead = RESCHEDULED
- Clinic marks "DNR" → lead = DNR, appointment = DNR
- Clinic marks "TWC" → lead = TWC
- Every status change updates lead's updatedAt + lastContactDate

BACKEND: Every PATCH /appointments/:id endpoint must:
1. Update the appointment status
2. Update the parent lead status to match
3. Update lead.updatedAt = now
4. Update lead.lastContactDate = now
5. Return updated lead + appointment data in response

FRONTEND AUTO-REFRESH:
- Add auto-polling every 30 seconds on:
  - AppointmentsPage (admin)
  - Leads page (admin & lead user)
  - LeadCard expanded view
  - StaffDashboard (clinic staff)
  - StaffSummaryPage (clinic staff)
  - Visited Tab (all roles)
  - Treatment Tab (all roles)
- Add "Last updated: X ago" text with refresh icon on every page
- After any mutation, immediately re-fetch data

TREATMENT PLAN/NOTES SYNC:
- Clinic staff updates treatment plan → updates lead record
- Admin expanding same lead sees updated treatment plan/notes
- lastContactDate updated
```

---

## Story 5: Visited Tab

**Size:** Large | **Priority:** 5 | **Dependencies:** Stories 1, 2, 3, 4

```
Create a new "Visited" tab in the main navigation (visible to Admin,
Lead User, and Clinic Staff).

WHO APPEARS HERE:
All patients/leads with status = VISITED (they came to the clinic,
appointment marked as visited/completed).

HOW PATIENTS GET HERE:
When appointment is marked as "Visited" (COMPLETED) at clinic level,
lead status changes to VISITED → patient appears in Visited tab.

VISITED TAB - PATIENT CARD MUST SHOW:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Treatment interest
- Visit date (appointment date)
- Last contact date
- Notes from clinic staff
- Treatment plan (if entered)

VISITED TAB - ACTIONS ON EACH PATIENT:
1. "Agrees Treatment" → changes lead status to TREATMENT_STARTED,
   prompts to schedule first treatment appointment, patient moves
   to Treatment Tab
2. "Denies Treatment" → changes lead status to LOST, patient
   removed from Visited tab
3. "DNR" → DNR confirmation dialog (Story 3), lead status → DNR,
   removed from Visited tab
4. "Follow-up" → schedule a new follow-up appointment (date/time
   picker), lead status stays VISITED or → FOLLOW_UP, patient
   stays in Visited tab with next appointment shown
5. "Lost" → lead status → LOST, removed from Visited tab
6. Edit treatment plan/notes inline
7. Add notes/comments

ALL ACTIONS SYNC (Story 4):
- Every action updates lastContactDate
- Every action reflects at Admin, Lead User, and Clinic Staff level
- Status changes cascade to lead record

ROLE-BASED VIEW:
- Admin: show all clinics with clinic filter
- Lead User: show assigned leads only
- Clinic Staff: show only their clinic's patients

FILTERS:
- Clinic filter (admin only)
- Search by patient name or phone
- Sort by: Visit date, Last contact date, Patient name
```

---

## Story 6: Treatment Tab

**Size:** Large | **Priority:** 6 | **Dependencies:** Stories 1, 2, 3, 4, 5

```
Create a new "Treatment" tab in the main navigation (visible to Admin,
Lead User, and Clinic Staff).

WHO APPEARS HERE:
All patients/leads with status = TREATMENT_STARTED.

HOW PATIENTS GET HERE:
From Visited Tab → "Agrees Treatment" → status changes to
TREATMENT_STARTED → patient appears in Treatment Tab.

TREATMENT TAB - PATIENT CARD MUST SHOW:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Treatment interest
- Treatment plan & treatment notes (editable inline)
- Last visit date
- Last contact date
- Next scheduled appointment (if any, with date/time)
- Appointment status (Scheduled, Confirmed, Rescheduled)

TREATMENT TAB - ACTIONS ON EACH PATIENT:
1. "Schedule Appointment" → book treatment appointment
   (date/time picker), creates new appointment linked to lead
2. "Reschedule" → reschedule existing upcoming appointment
   (new date/time + optional reason)
3. "Mark Visited" → patient visited for treatment session,
   mark appointment as Visited (COMPLETED), update notes,
   then prompt to schedule next appointment if more sessions needed
4. "DNR" → DNR confirmation dialog (Story 3), lead → DNR,
   removed from Treatment tab
5. "Lost" → lead status → LOST, removed from Treatment tab
6. Edit treatment plan/notes inline
7. Add notes/comments

TREATMENT CYCLE:
Schedule → Patient visits → Mark Visited → Update notes →
Schedule next session → Repeat

TREATMENT SCHEDULE SECTION:
Within the Treatment tab, show "Upcoming Treatment Schedule":
- All upcoming treatment appointments sorted by date
- Date & time, patient name, phone, clinic, treatment interest
- Status badge (Scheduled/Confirmed/Rescheduled)
- Reschedule button on each row

ALL ACTIONS SYNC (Story 4):
- Every action updates lastContactDate
- Every action reflects at Admin, Lead User, Clinic Staff
- Appointment changes cascade to lead status
- Treatment plan/notes visible to all roles

ROLE-BASED VIEW:
- Admin: show all clinics with clinic filter
- Lead User: show assigned leads only
- Clinic Staff: show only their clinic's patients

FILTERS:
- Clinic filter (admin only)
- Search by patient name or phone
- Filter: Has appointment / No appointment scheduled
- Sort by: Next appointment date, Last contact date, Patient name
```

---

## Implementation Order

| # | Story | Size | Why This Order |
|---|-------|------|----------------|
| 1 | Story 1 - Schema + lastContactDate | Medium | Foundation - all other stories depend on this |
| 2 | Story 2 - Label changes (Visited, Lost, phone, remove Attempting) | Small | Quick wins, needed before building new tabs |
| 3 | Story 3 - DNR confirmation dialog (reusable component) | Medium | Reusable component needed by Stories 5 & 6 |
| 4 | Story 4 - Full sync (clinic↔admin↔lead + auto-refresh) | Medium | Sync mechanism needed before new tabs |
| 5 | Story 5 - Visited Tab | Large | Must exist before Treatment Tab |
| 6 | Story 6 - Treatment Tab | Large | Depends on Visited Tab flow |

## Old Story → New Story Mapping

| Old Story | Where It Went |
|-----------|--------------|
| Remove ATTEMPTING quick status | → Story 2 (Label changes) |
| Phone font increase | → Story 2 (Label changes) |
| "Completed" → "Visited" | → Story 2 (Label changes) |
| "No Show" → "Lost" + sync | → Story 2 (Label changes) + Story 4 (Sync) |
| DNR confirmation dialog | → Story 3 (DNR dialog) |
| Last Contact Date | → Story 1 (Schema) |
| Full sync (clinic↔admin↔lead) | → Story 4 (Sync) |
| Treatment Tab with full actions | → Story 5 (Visited Tab) + Story 6 (Treatment Tab) |
