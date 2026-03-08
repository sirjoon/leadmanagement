# DentraCRM - Feature Stories (v2)

## Navigation
```
Leads | Appointments | Visited | Treatment | Treatment Denied | Follow-ups | DNR/DNC | Lost | Reports
```
All 9 tabs visible to Admin, Lead User, and Clinic Staff (except Reports — not for Clinic Staff).
Enterprise-grade responsive design — works on web and mobile.

## Patient Journey Flow

```
LEAD → APPOINTMENT BOOKED →
  ├── Patient Visits → VISITED (moves to Visited Tab)
  ├── DNR (confirmation dialog) → DNR/DNC Tab
  ├── TWC (Will Call Back) → can add to Follow-ups
  └── LOST → Lost Tab

VISITED TAB (status = VISITED) →
  ├── "Agrees Treatment" → TREATMENT_STARTED → Treatment Tab
  │     → prompts to schedule first treatment appointment
  ├── "Denies Treatment" → TREATMENT_DENIED → Treatment Denied Tab
  ├── "DNR" (confirmation dialog) → DNR → DNR/DNC Tab
  ├── "Follow-up" checkbox → appears in Follow-ups Tab (stays VISITED)
  └── "Lost" → LOST → Lost Tab

TREATMENT TAB (status = TREATMENT_STARTED) →
  ├── Schedule / Reschedule appointment
  ├── Patient visits → "Mark Visited" → asks:
  │     ├── "Treatment Accepted" → stays TREATMENT_STARTED
  │     │     → schedule next appointment → repeat cycle
  │     └── "Treatment Denied" → TREATMENT_DENIED → Treatment Denied Tab
  ├── "DNR" (confirmation dialog) → DNR → DNR/DNC Tab
  └── "Lost" → LOST → Lost Tab

TREATMENT DENIED TAB (status = TREATMENT_DENIED) →
  ├── "Follow-up" checkbox → appears in Follow-ups Tab
  ├── Staff calls, patient changes mind →
  │     ├── "Move to Treatment" → TREATMENT_STARTED → Treatment Tab
  │     └── "New Appointment" → APPOINTMENT_BOOKED → Appointments Tab
  ├── "DNR" (confirmation dialog) → DNR → DNR/DNC Tab
  └── "Lost" → LOST → Lost Tab

FOLLOW-UPS TAB (cross-cutting view) →
  Shows ANY lead from ANY tab that has:
  - A follow-up date set, OR
  - "Follow-up" checkbox checked
  Sorted by follow-up date. Lead stays in original tab AND appears here.
  Actions: Call, Update status, Remove from follow-ups

DNR/DNC TAB (status = DNR or DNC) →
  Archive view. Can add "Follow-up" checkbox → appears in Follow-ups.
  Re-engagement possible via Follow-ups tab.

LOST TAB (status = LOST) →
  Archive view. Can add "Follow-up" checkbox → appears in Follow-ups.
  Re-engagement possible via Follow-ups tab.
```

---

## Story 1: Schema Changes — STATUS: PENDING

**Size:** Medium | **Priority:** 1 | **Dependencies:** None (foundation)

```
SCHEMA CHANGES:

1. Add to Lead model in Prisma:
   - "lastContactDate" (DateTime, optional)
   - "followUp" (Boolean, default false)
   - "followUpDate" (DateTime, optional)

2. Add TREATMENT_DENIED to LeadStatus enum.
   Final enum: NEW, ATTEMPTING, CONNECTED, APPOINTMENT_BOOKED,
   VISITED, TREATMENT_STARTED, TREATMENT_DENIED, RESCHEDULED,
   LOST, DNA, DNC, DNR, TWC

3. Run Prisma migration on dev database.

4. Update ALL backend endpoints that modify a lead or its
   appointments to also set lastContactDate = new Date():
   - POST /leads (create)
   - PATCH /leads/:id (update status, notes, etc.)
   - POST /leads/:id/notes (add note)
   - POST /appointments (create appointment)
   - PATCH /appointments/:id (status change, reschedule)
   - PATCH /appointments/:id/treatment-plan (treatment update)

5. Add new API endpoints:
   - PATCH /leads/:id/follow-up — toggle followUp boolean, set followUpDate
   - GET /leads/follow-ups — get all leads with followUp=true, sorted by followUpDate

6. lastContactDate, followUp, followUpDate must be returned
   in all lead API responses.

7. Display lastContactDate on:
   - LeadCard (admin & lead user)
   - StaffDashboard (clinic staff)
   - All new tabs
   - Format in IST using existing formatDateIST utility
```

---

## Story 2: UI Label Changes — STATUS: PENDING

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

4. Phone number font increase across ALL pages:
   - Use text-lg font-semibold on all phone number displays
   - Must be clickable tel: link for click-to-call
   - Apply to: LeadCard, StaffDashboard, all new tabs,
     appointment cards, any list/table showing phone numbers

Apply all label changes at all levels: Admin, Lead User, Clinic Staff.
```

---

## Story 3: DNR Confirmation Dialog — STATUS: PENDING

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

Create as a REUSABLE component (DNRConfirmDialog) used on:
- LeadCard (admin & lead user quick status)
- StaffDashboard (clinic staff appointment actions)
- Visited Tab
- Treatment Tab
- Treatment Denied Tab
- Follow-ups Tab

After DNR confirmed:
- Lead status → DNR
- Appointment status → DNR (if active appointment exists)
- Update lastContactDate
- Patient moves to DNR/DNC Tab
- Syncs to all user levels
```

---

## Story 4: Clinic <-> Admin <-> Lead Full Sync — STATUS: PENDING

**Size:** Medium | **Priority:** 4 | **Dependencies:** Story 1

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
- Add auto-polling every 30 seconds on ALL pages:
  - Leads, Appointments, Visited, Treatment, Treatment Denied,
    Follow-ups, DNR/DNC, Lost, StaffDashboard, StaffSummaryPage
- Add "Last updated: X ago" text with refresh icon on every page
- After any mutation, immediately re-fetch data

TREATMENT PLAN/NOTES SYNC:
- Clinic staff updates treatment plan → updates lead record
- Admin expanding same lead sees updated treatment plan/notes
- lastContactDate updated
```

---

## Story 5: Visited Tab — STATUS: PENDING

**Size:** Large | **Priority:** 5 | **Dependencies:** Stories 1, 2, 3, 4

```
Create "Visited" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

WHO APPEARS HERE:
All leads with status = VISITED.

HOW PATIENTS GET HERE:
Appointment marked as "Visited" (COMPLETED) → lead status = VISITED.

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Treatment interest
- Visit date (appointment date)
- Last contact date
- Notes from clinic staff
- Treatment plan (if entered)
- Follow-up checkbox + follow-up date

ACTIONS ON EACH PATIENT:
1. "Agrees Treatment" → status = TREATMENT_STARTED
   → prompt to schedule first treatment appointment
   → patient moves to Treatment Tab
2. "Denies Treatment" → status = TREATMENT_DENIED
   → patient moves to Treatment Denied Tab
3. "DNR" → DNR confirmation dialog (Story 3)
   → status = DNR → moves to DNR/DNC Tab
4. "Follow-up" checkbox → set follow-up date
   → patient appears in Follow-ups Tab (stays in Visited too)
5. "Lost" → status = LOST → moves to Lost Tab
6. Edit treatment plan/notes inline
7. Add notes/comments

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only

FILTERS & SORT:
- Clinic filter (admin only)
- Search by patient name or phone
- Sort by: Visit date, Last contact date, Patient name

ALL ACTIONS SYNC (Story 4):
Every action updates lastContactDate and reflects across all roles.
```

---

## Story 6: Treatment Tab — STATUS: PENDING

**Size:** Large | **Priority:** 6 | **Dependencies:** Stories 1-5

```
Create "Treatment" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

WHO APPEARS HERE:
All leads with status = TREATMENT_STARTED.

HOW PATIENTS GET HERE:
From Visited Tab → "Agrees Treatment" → TREATMENT_STARTED.

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Treatment interest
- Treatment plan & treatment notes (editable inline)
- Last visit date
- Last contact date
- Next scheduled appointment (date/time + status)
- Follow-up checkbox + follow-up date

ACTIONS ON EACH PATIENT:
1. "Schedule Appointment" → book treatment appointment (date/time picker)
2. "Reschedule" → reschedule upcoming appointment (new date/time + reason)
3. "Mark Visited" → mark appointment as Visited (COMPLETED)
   → system asks: "Treatment Accepted or Treatment Denied?"
     ├── "Treatment Accepted" → stays TREATMENT_STARTED
     │   → prompt to schedule next appointment
     └── "Treatment Denied" → status = TREATMENT_DENIED
         → moves to Treatment Denied Tab
4. "DNR" → DNR confirmation dialog → moves to DNR/DNC Tab
5. "Lost" → status = LOST → moves to Lost Tab
6. "Follow-up" checkbox → appears in Follow-ups Tab too
7. Edit treatment plan/notes inline
8. Add notes/comments

TREATMENT SCHEDULE SECTION:
Within the tab, show "Upcoming Treatment Schedule":
- All upcoming treatment appointments sorted by date
- Date & time, patient name, phone, clinic, treatment interest
- Status badge (Scheduled/Confirmed/Rescheduled)
- Reschedule button on each row

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only

FILTERS & SORT:
- Clinic filter (admin only)
- Search by patient name or phone
- Filter: Has appointment / No appointment scheduled
- Sort by: Next appointment date, Last contact date, Patient name
```

---

## Story 7: Treatment Denied Tab — STATUS: PENDING

**Size:** Medium | **Priority:** 7 | **Dependencies:** Stories 1-6

```
Create "Treatment Denied" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

WHO APPEARS HERE:
All leads with status = TREATMENT_DENIED.

HOW PATIENTS GET HERE:
- From Visited Tab → "Denies Treatment"
- From Treatment Tab → "Mark Visited" → "Treatment Denied"

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Treatment interest
- Treatment plan (what was proposed)
- Date treatment was denied
- Last contact date
- Notes/reason for denial
- Follow-up checkbox + follow-up date

ACTIONS ON EACH PATIENT (RE-ENGAGEMENT):
1. "Move to Treatment" → status = TREATMENT_STARTED
   → prompt to schedule appointment
   → patient moves to Treatment Tab
2. "New Appointment" → status = APPOINTMENT_BOOKED
   → schedule new appointment
   → patient moves to Appointments view
3. "Follow-up" checkbox → set follow-up date
   → patient appears in Follow-ups Tab
4. "DNR" → DNR confirmation dialog → moves to DNR/DNC Tab
5. "Lost" → status = LOST → moves to Lost Tab
6. Add notes/comments

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only

FILTERS & SORT:
- Clinic filter (admin only)
- Search by patient name or phone
- Sort by: Denial date, Last contact date, Patient name
```

---

## Story 8: Follow-ups Tab — STATUS: PENDING

**Size:** Large | **Priority:** 8 | **Dependencies:** Stories 1-7

```
Create "Follow-ups" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

THIS IS A CROSS-CUTTING VIEW:
Shows ANY lead from ANY status/tab that has:
- followUp = true, OR
- followUpDate is set

The lead STAYS in its original tab AND also appears here.
This is a "reminder list" pulling from all other tabs.

EXAMPLES:
- Lead in DNR/DNC Tab → check "Follow-up" → appears here
- Lead in Lost Tab → check "Follow-up" → appears here
- Lead in Visited Tab → set follow-up date → appears here
- Lead in Treatment Denied → check "Follow-up" → appears here
- Lead in Treatment Tab → set follow-up date → appears here

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Current status (with color badge)
- Original tab the patient belongs to
- Follow-up date (red if overdue, amber if today, green if future)
- Last contact date
- Notes

ACTIONS ON EACH PATIENT:
1. "Call" / Click phone → tel: link
2. Update status → based on current status, show relevant options:
   - If VISITED → Agrees Treatment, Denies Treatment, Lost
   - If TREATMENT_DENIED → Move to Treatment, New Appointment, Lost
   - If DNR/DNC → Move to Treatment, New Appointment
   - If LOST → New Appointment, Move to Treatment
3. "Remove from Follow-ups" → uncheck followUp, clear followUpDate
4. "Reschedule Follow-up" → change follow-up date
5. Add notes/comments
6. Update lastContactDate on every action

SORTING & GROUPING:
- Default sort: Follow-up date (overdue first, then today, then future)
- Group by: Today, This Week, Overdue, Upcoming
- Search by patient name or phone
- Filter by original status (Visited, Treatment Denied, DNR, Lost, etc.)
- Clinic filter (admin only)

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only
```

---

## Story 9: DNR/DNC Tab — STATUS: PENDING

**Size:** Medium | **Priority:** 9 | **Dependencies:** Stories 1-4

```
Create "DNR/DNC" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

WHO APPEARS HERE:
All leads with status = DNR or DNC.

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Status badge (DNR or DNC)
- Date moved to DNR/DNC
- Reason/notes
- Last contact date
- Follow-up checkbox + follow-up date

ACTIONS ON EACH PATIENT:
1. "Follow-up" checkbox → set follow-up date
   → patient appears in Follow-ups Tab
2. Toggle between DNR ↔ DNC
3. Add notes/comments
4. View full history (all status changes, appointments, notes)

FILTERS:
- Filter: DNR only / DNC only / Both
- Clinic filter (admin only)
- Search by patient name or phone
- Sort by: Date added, Last contact date, Patient name

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only
```

---

## Story 10: Lost Tab — STATUS: PENDING

**Size:** Medium | **Priority:** 10 | **Dependencies:** Stories 1-4

```
Create "Lost" page in main navigation.
All roles: Admin, Lead User, Clinic Staff.
Enterprise responsive design (web + mobile).

WHO APPEARS HERE:
All leads with status = LOST.

PATIENT CARD SHOWS:
- Patient name
- Phone number (large font, clickable tel: link)
- Clinic name
- Date marked as lost
- Last status before lost
- Reason/notes
- Last contact date
- Follow-up checkbox + follow-up date

ACTIONS ON EACH PATIENT:
1. "Follow-up" checkbox → set follow-up date
   → patient appears in Follow-ups Tab
2. "Re-engage" → "New Appointment" → status = APPOINTMENT_BOOKED
   → schedule appointment → moves to Appointments
3. Add notes/comments
4. "DNR" → DNR confirmation → moves to DNR/DNC Tab
5. View full history

FILTERS:
- Clinic filter (admin only)
- Search by patient name or phone
- Sort by: Date lost, Last contact date, Patient name
- Filter by: Lost from (Visited, Treatment, Treatment Denied, etc.)

ROLE-BASED VIEW:
- Admin: all clinics with clinic filter
- Lead User: assigned leads only
- Clinic Staff: their clinic's patients only
```

---

## Story 11: Enterprise Responsive Navigation — STATUS: PENDING

**Size:** Medium | **Priority:** Can be done alongside Story 5

```
Redesign main navigation to handle 9 tabs on web and mobile.

DESKTOP (>1024px):
- Horizontal tab bar with all 9 tabs visible
- Active tab highlighted with accent color
- Badge counts on each tab (e.g., Visited: 5, Follow-ups: 12)
- Compact labels: Leads, Appointments, Visited, Treatment,
  Tx Denied, Follow-ups, DNR/DNC, Lost, Reports

TABLET (768-1024px):
- Horizontal scrollable tab bar
- Swipe to see more tabs
- Active tab auto-scrolls into view

MOBILE (<768px):
- Bottom navigation with 4-5 primary tabs
- "More" opens slide-up sheet with remaining tabs
- Or: hamburger menu with full tab list

DESIGN REQUIREMENTS:
- Clean, professional, enterprise-grade look
- Consistent with existing TailwindCSS design system
- Smooth transitions and animations
- Tab badges showing count of items
- Color-coded status indicators
```

---

## Story 12: Reports Tab (Hide from Clinic) — STATUS: PENDING

**Size:** Small | **Priority:** 12

```
Reports tab already exists. Only change:
- Hide Reports tab from Clinic Staff users
- Admin and Lead User can access Reports
- No other changes to Reports functionality
```

---

## Implementation Order

| # | Story | Size | Status |
|---|-------|------|--------|
| 1 | Story 1 - Schema (lastContactDate, followUp, TREATMENT_DENIED) | Medium | PENDING |
| 2 | Story 2 - Label changes (Visited, Lost, phone, remove Attempting) | Small | PENDING |
| 3 | Story 3 - DNR confirmation dialog (reusable component) | Medium | PENDING |
| 4 | Story 4 - Full sync (clinic↔admin↔lead + auto-refresh) | Medium | PENDING |
| 5 | Story 11 - Responsive navigation (9 tabs) | Medium | PENDING |
| 6 | Story 5 - Visited Tab | Large | PENDING |
| 7 | Story 6 - Treatment Tab | Large | PENDING |
| 8 | Story 7 - Treatment Denied Tab | Medium | PENDING |
| 9 | Story 8 - Follow-ups Tab (cross-cutting) | Large | PENDING |
| 10 | Story 9 - DNR/DNC Tab | Medium | PENDING |
| 11 | Story 10 - Lost Tab | Medium | PENDING |
| 12 | Story 12 - Reports (hide from clinic) | Small | PENDING |

## Status Legend
- NEW, ATTEMPTING, CONNECTED, APPOINTMENT_BOOKED — Leads Tab
- VISITED — Visited Tab
- TREATMENT_STARTED — Treatment Tab
- TREATMENT_DENIED — Treatment Denied Tab (NEW STATUS)
- RESCHEDULED, TWC — Leads Tab (can appear in Follow-ups)
- DNR, DNC — DNR/DNC Tab
- LOST — Lost Tab
- DNA — Leads Tab

Follow-ups Tab is cross-cutting — shows leads from ANY tab with followUp=true.
