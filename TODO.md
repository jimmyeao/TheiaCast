# TheiaCast Development Roadmap & Todo List

**Last Updated:** 2025-12-29

This document tracks completed features and upcoming development priorities for TheiaCast Digital Signage platform.

---

## ✅ Completed Features

### Phase 0: Critical Security Fixes
- [x] **BCrypt password hashing** - Migrated from SHA256 to BCrypt
- [x] **Refresh token security** - Database-backed token validation with rotation
- [x] **Admin WebSocket authentication** - Token-based WebSocket connections
- [x] **Secure test scripts** - Removed hardcoded credentials from test files

### Phase 6: .NET Migration
- [x] **ASP.NET Core 8.0 backend** - Migrated from NestJS to .NET
- [x] **PostgreSQL database** - Migrated from SQLite with EF Core
- [x] **Native WebSockets** - Replaced Socket.IO with native implementation
- [x] **JWT authentication** - Bearer token auth with MFA support
- [x] **Live streaming via CDP** - Chrome DevTools Protocol screencast (10-30 FPS)
- [x] **Remote browser control** - Click, type, keyboard, scroll commands
- [x] **Auto-authentication** - Stored credentials for automatic login
- [x] **Persistent sessions** - Chromium profile retention across restarts

### Phase 7: Polish & Parity (Partial)
- [x] **Device tagging system** - Many-to-many Tags ↔ Devices ↔ Playlists
  - Bidirectional auto-assignment
  - Smart unassignment (only removes if no other matching tags)
  - One tag = one playlist restriction
  - Tag selector UI with dropdown
  - Files: `Entities.cs`, `TagService.cs`, `Program.cs`, `TagSelector.tsx`, `PlaylistTagSelector.tsx`

- [x] **Drag-and-drop playlist reordering** - Using @dnd-kit library
  - Visual drag handles
  - Live reordering with optimistic updates
  - Backend OrderIndex updates
  - Files: `PlaylistsPage.tsx` (lines 7-21, 302-480)

- [x] **Tag selector overflow fix** - Changed card from overflow-hidden to overflow-visible
  - Files: `DevicesPage.tsx` (line 230), `TagSelector.tsx`

- [x] **Content preview (thumbnails)** - Thumbnail generation and caching
  - Puppeteer-based screenshot generation for content URLs
  - Cached thumbnails stored in database
  - Display on content management page

---

## 🚀 Phase 7: Polish & Parity (Remaining)

**Goal:** Match commercial solutions in core UX

### 1. ✅ Content Preview (Thumbnails) - COMPLETED
- Puppeteer-based screenshot generation for content URLs
- Cached thumbnails stored in database
- Display on content management page
- "Rebuild Thumbnails" button added

### 2. ✅ Mobile-Responsive Admin UI - COMPLETED (2025-12-29)
**Priority:** CRITICAL | **Effort:** 2 weeks | **User Value:** High

**Why:** Manage displays from tablet/phone on-site

**Completed Work:**
All 9 admin pages are now fully mobile-responsive (375px+ width support):

1. **DashboardLayout** - Hamburger menu, sliding sidebar with backdrop, responsive navbar
2. **DashboardPage** - Responsive stat cards (1→2→3 columns), responsive lists
3. **DevicesPage** - Responsive flip cards, stacked header, touch-friendly tag filters
4. **ContentPage** - Responsive button groups with shortened labels, flexible layout
5. **PlaylistsPage** - Responsive drag-and-drop items, stacked layouts on mobile
6. **LogsPage** - Horizontal scroll table with mobile warning, responsive filters
7. **UsersPage** - Horizontal scroll table with mobile warning, responsive header
8. **SettingsPage** - Responsive forms, full-width buttons on mobile
9. **LicensePage** - Responsive sections, flexible installation key display

**Key Responsive Features Implemented:**
- Hamburger menu navigation for mobile (<1024px)
- Sliding sidebar with smooth animations and backdrop overlay
- Touch-friendly targets (≥44px minimum height for all interactive elements)
- Responsive text sizes (text-2xl sm:text-3xl patterns)
- Flexible layouts (flex-col sm:flex-row for stacking)
- Responsive grids (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3)
- Horizontal scroll hints for tables on mobile
- Shortened button text on small screens (e.g., "Upload Video" → "Video")
- Full-width buttons on mobile, auto-width on desktop
- Responsive padding (p-3 sm:p-4 lg:p-6)
- Responsive gaps (gap-2 sm:gap-4)
- Proper text truncation to prevent overflow

**Files Modified:**
- frontend/src/components/layout/DashboardLayout.tsx
- frontend/src/pages/DashboardPage.tsx
- frontend/src/pages/DevicesPage.tsx
- frontend/src/pages/ContentPage.tsx
- frontend/src/pages/PlaylistsPage.tsx
- frontend/src/pages/LogsPage.tsx
- frontend/src/pages/UsersPage.tsx
- frontend/src/pages/SettingsPage.tsx
- frontend/src/pages/LicensePage.tsx

**Acceptance Criteria - ALL MET:**
- ✅ All pages usable on 375px width (iPhone SE)
- ✅ Navigation collapses to hamburger menu on mobile (<1024px)
- ✅ Cards stack vertically on mobile
- ✅ Tables scroll horizontally with visual hints on mobile
- ✅ Touch targets ≥44px for all buttons
- ✅ No horizontal scrolling on any page (except intentional table scroll)

---

### 3. Audit Logging ⭐⭐⭐ (1 week)
**Priority:** MEDIUM | **Effort:** 1 week | **User Value:** Medium (Enterprise requirement)

**Why:** Enterprise compliance, track who changed what and when

**Features:**
- Log all user actions (login, logout, device changes, content updates, playlist modifications)
- Audit trail page with filtering (user, action type, date range)
- Export audit log to CSV/JSON
- Retention policy (90-365 days configurable)

**Technical Approach:**
- Extend existing `Logs` table with new fields
- Add middleware to log all authenticated requests
- Create audit-specific log entries with:
  - UserId, Username
  - Action (e.g., "device.update", "playlist.delete")
  - EntityType, EntityId
  - OldValue, NewValue (JSON)
  - IpAddress, UserAgent
  - Timestamp

**Database Changes:**
```sql
ALTER TABLE "Logs" ADD COLUMN "UserId" INT NULL;
ALTER TABLE "Logs" ADD COLUMN "Username" VARCHAR(255) NULL;
ALTER TABLE "Logs" ADD COLUMN "Action" VARCHAR(100) NULL;
ALTER TABLE "Logs" ADD COLUMN "EntityType" VARCHAR(50) NULL;
ALTER TABLE "Logs" ADD COLUMN "EntityId" INT NULL;
ALTER TABLE "Logs" ADD COLUMN "OldValue" TEXT NULL;
ALTER TABLE "Logs" ADD COLUMN "NewValue" TEXT NULL;
ALTER TABLE "Logs" ADD COLUMN "IpAddress" VARCHAR(45) NULL;
ALTER TABLE "Logs" ADD COLUMN "UserAgent" TEXT NULL;
```

**Files to Modify:**
- `src/TheiaCast.Api/Entities.cs` - Add fields to Log entity
- `src/TheiaCast.Api/Program.cs` - Add audit middleware
- `src/TheiaCast.Api/LogService.cs` - Add audit logging methods
- `frontend/src/pages/LogsPage.tsx` - Add audit trail view/filters

**Acceptance Criteria:**
- [ ] All user actions logged with user context
- [ ] Audit log page shows who did what and when
- [ ] Filter by user, action type, entity type, date range
- [ ] Export to CSV/JSON
- [ ] Retention policy configurable in settings

---

## 📊 Phase 8: Enterprise Features

**Goal:** Target enterprise customers with premium features

### 4. Advanced Analytics Dashboard ⭐⭐⭐⭐ (3 weeks)
**Priority:** HIGH | **Effort:** 3 weeks | **User Value:** High

**Why:** Competitors charge premium for this; data-driven insights

**Features:**
- Content view duration tracking (how long each content item displayed)
- Device uptime/downtime graphs (24h, 7d, 30d views)
- Playlist engagement metrics (most viewed, least viewed)
- Error rate monitoring (device errors over time)
- Real-time dashboard with auto-refresh
- Export analytics to CSV/PDF

**Technical Approach:**
- **Backend:** New `ContentViews` table to track content display events
- **Client:** Send `content:view:start` and `content:view:end` events
- **Frontend:** Chart.js or Recharts for visualizations
- **Database:** Aggregate queries for analytics data

**Database Changes:**
```sql
CREATE TABLE "ContentViews" (
  "Id" SERIAL PRIMARY KEY,
  "DeviceId" INT NOT NULL REFERENCES "Devices"("Id"),
  "ContentId" INT NULL REFERENCES "Content"("Id"),
  "PlaylistId" INT NULL REFERENCES "Playlists"("Id"),
  "PlaylistItemId" INT NULL REFERENCES "PlaylistItems"("Id"),
  "StartedAt" TIMESTAMP NOT NULL,
  "EndedAt" TIMESTAMP NULL,
  "DurationSeconds" INT NULL,
  "Url" TEXT NULL
);

CREATE INDEX "IX_ContentViews_DeviceId" ON "ContentViews"("DeviceId");
CREATE INDEX "IX_ContentViews_ContentId" ON "ContentViews"("ContentId");
CREATE INDEX "IX_ContentViews_StartedAt" ON "ContentViews"("StartedAt");
```

**Files to Create:**
- `frontend/src/pages/AnalyticsPage.tsx` - Main analytics dashboard
- `src/TheiaCast.Api/AnalyticsService.cs` - Analytics queries
- `raspberrypi-client/src/analytics.ts` - Track content views

**Files to Modify:**
- `src/TheiaCast.Api/Entities.cs` - Add ContentViews entity
- `src/TheiaCast.Api/Program.cs` - Add analytics endpoints
- `frontend/src/App.tsx` - Add analytics route

**Acceptance Criteria:**
- [ ] Track content view duration from devices
- [ ] Dashboard shows device uptime (24h, 7d, 30d)
- [ ] Chart: Most viewed content items
- [ ] Chart: Playlist engagement over time
- [ ] Chart: Error rate trend
- [ ] Export analytics to CSV/PDF
- [ ] Auto-refresh every 30 seconds

---

### 5. Alert System ⭐⭐⭐⭐ (2 weeks)
**Priority:** HIGH | **Effort:** 2 weeks | **User Value:** High

**Why:** Proactive monitoring better than reactive troubleshooting

**Features:**
- Email alerts for device offline (configurable timeout)
- Health threshold alerts (CPU >90%, memory >90%, disk >95%)
- Screenshot comparison alerts (detect frozen/crashed displays)
- Webhook support for integration with Slack, Teams, PagerDuty
- Alert rules management UI
- Alert history log

**Technical Approach:**
- **Backend:** Email service (SMTP, SendGrid, or similar)
- **Database:** `AlertRules` and `AlertHistory` tables
- **Background Jobs:** Periodic checks for offline devices, health thresholds
- **WebSocket:** Real-time alert notifications to admin UI

**Database Changes:**
```sql
CREATE TABLE "AlertRules" (
  "Id" SERIAL PRIMARY KEY,
  "Name" VARCHAR(255) NOT NULL,
  "Type" VARCHAR(50) NOT NULL, -- 'device_offline', 'health_threshold', 'screenshot_frozen'
  "DeviceId" INT NULL REFERENCES "Devices"("Id"), -- NULL = all devices
  "Threshold" TEXT NULL, -- JSON: {"cpu": 90, "memory": 90, "disk": 95}
  "TimeoutMinutes" INT NULL,
  "EmailRecipients" TEXT NULL, -- JSON array
  "WebhookUrl" TEXT NULL,
  "IsEnabled" BOOLEAN DEFAULT TRUE,
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "AlertHistory" (
  "Id" SERIAL PRIMARY KEY,
  "AlertRuleId" INT NULL REFERENCES "AlertRules"("Id"),
  "DeviceId" INT NULL REFERENCES "Devices"("Id"),
  "Type" VARCHAR(50) NOT NULL,
  "Message" TEXT NOT NULL,
  "Severity" VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
  "TriggeredAt" TIMESTAMP DEFAULT NOW(),
  "ResolvedAt" TIMESTAMP NULL,
  "EmailSent" BOOLEAN DEFAULT FALSE,
  "WebhookSent" BOOLEAN DEFAULT FALSE
);
```

**Files to Create:**
- `src/TheiaCast.Api/AlertService.cs` - Alert rule evaluation, email/webhook sending
- `src/TheiaCast.Api/BackgroundJobs/AlertMonitorJob.cs` - Background monitoring
- `frontend/src/pages/AlertsPage.tsx` - Alert rules management
- `frontend/src/components/AlertHistory.tsx` - Alert history view

**Files to Modify:**
- `src/TheiaCast.Api/Entities.cs` - Add AlertRules, AlertHistory entities
- `src/TheiaCast.Api/Program.cs` - Add alert endpoints, register background job
- `appsettings.json` - Add SMTP configuration

**Acceptance Criteria:**
- [ ] Create alert rules for device offline (with timeout)
- [ ] Create alert rules for health thresholds
- [ ] Email notifications sent when alerts trigger
- [ ] Webhook notifications sent when alerts trigger
- [ ] Real-time alerts in admin UI via WebSocket
- [ ] Alert history page with filtering
- [ ] Alerts auto-resolve when condition clears

---

### 6. Multi-Zone Layouts ⭐⭐ (3 weeks)
**Priority:** MEDIUM | **Effort:** 3 weeks | **User Value:** Medium (Specialized use case)

**Why:** Display multiple content items simultaneously (e.g., dashboard + news ticker)

**Features:**
- Predefined layouts: 2-zone (50/50, 70/30), 3-zone, 4-zone (grid)
- Custom CSS Grid layouts (advanced users)
- Assign different content to each zone
- Per-zone rotation settings
- Preview layout before applying

**Technical Approach:**
- **Backend:** `Layouts` and `LayoutZones` tables
- **Client:** Puppeteer multi-tab or iframes for each zone
- **Frontend:** Visual layout editor

**Database Changes:**
```sql
CREATE TABLE "Layouts" (
  "Id" SERIAL PRIMARY KEY,
  "Name" VARCHAR(255) NOT NULL,
  "GridTemplate" TEXT NOT NULL, -- CSS grid-template-areas
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "LayoutZones" (
  "Id" SERIAL PRIMARY KEY,
  "LayoutId" INT NOT NULL REFERENCES "Layouts"("Id"),
  "ZoneName" VARCHAR(50) NOT NULL, -- 'main', 'sidebar', 'ticker'
  "PlaylistId" INT NULL REFERENCES "Playlists"("Id"),
  "Width" VARCHAR(20) NULL, -- CSS width
  "Height" VARCHAR(20) NULL, -- CSS height
  "GridArea" VARCHAR(50) NOT NULL -- CSS grid-area name
);
```

**Acceptance Criteria:**
- [ ] Create 2-zone layout (50/50 vertical split)
- [ ] Assign different playlists to each zone
- [ ] Device displays both zones simultaneously
- [ ] Each zone rotates independently
- [ ] Preview layout before applying

---

## 🎯 Phase 9: Differentiation

**Goal:** Build on unique strengths, features competitors don't have

### 7. Dynamic Data Feeds ⭐⭐⭐ (4 weeks)
**Priority:** MEDIUM | **Effort:** 4 weeks | **User Value:** Medium

**Why:** Live data integration (weather, stock prices, RSS feeds)

**Features:**
- RSS feed parsing and display
- REST API data polling (JSON)
- Template-based data rendering (Handlebars/EJS)
- Auto-refresh intervals
- Data feed preview
- Pre-built templates for common feeds (weather, news, stocks)

**Technical Approach:**
- **Backend:** RSS parser, HTTP client for APIs, template engine
- **Client:** Data refresh via WebSocket push
- **Frontend:** Data feed editor with template preview

**Database Changes:**
```sql
CREATE TABLE "DataFeeds" (
  "Id" SERIAL PRIMARY KEY,
  "Name" VARCHAR(255) NOT NULL,
  "Type" VARCHAR(50) NOT NULL, -- 'rss', 'rest_api'
  "SourceUrl" TEXT NOT NULL,
  "RefreshIntervalSeconds" INT DEFAULT 300,
  "Template" TEXT NULL, -- Handlebars/EJS template
  "IsActive" BOOLEAN DEFAULT TRUE,
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);
```

**Acceptance Criteria:**
- [ ] Add RSS feed URL
- [ ] Parse and display RSS items
- [ ] Add REST API endpoint
- [ ] Template editor for custom layouts
- [ ] Auto-refresh every N seconds
- [ ] Preview data feed before adding

---

### 8. Conditional Content Rules ⭐⭐ (4 weeks)
**Priority:** MEDIUM | **Effort:** 4 weeks | **User Value:** Medium

**Why:** Smart content display based on conditions (time, day, device, custom)

**Features:**
- Show content only during specific times (e.g., lunch menu 11am-2pm)
- Show content only on specific days (e.g., weekend promotions)
- Show content only on devices with specific tags
- Rule engine for complex logic (AND/OR conditions)

**Technical Approach:**
- **Backend:** Rule evaluation engine (JSON rules)
- **Client:** Rule validation before displaying content
- **Frontend:** Rule builder UI

**Database Changes:**
```sql
CREATE TABLE "ContentRules" (
  "Id" SERIAL PRIMARY KEY,
  "ContentId" INT NULL REFERENCES "Content"("Id"),
  "PlaylistItemId" INT NULL REFERENCES "PlaylistItems"("Id"),
  "RuleType" VARCHAR(50) NOT NULL, -- 'time_window', 'day_of_week', 'device_tag'
  "RuleData" TEXT NOT NULL, -- JSON: {"startTime": "11:00", "endTime": "14:00", "days": ["Mon", "Tue"]}
  "IsActive" BOOLEAN DEFAULT TRUE,
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);
```

**Acceptance Criteria:**
- [ ] Create time window rule (HH:mm - HH:mm)
- [ ] Create day of week rule (Mon-Sun selection)
- [ ] Create device tag rule (only show on devices with tag X)
- [ ] Combine rules with AND/OR logic
- [ ] Client evaluates rules before displaying content
- [ ] Rule preview shows when content will display

---

### 9. Touch Screen Kiosk Enhancements ⭐⭐ (2 weeks)
**Priority:** LOW | **Effort:** 2 weeks | **User Value:** Low (Specialized use case)

**Why:** Interactive kiosks (directories, wayfinding, self-service)

**Features:**
- Touch event handling via Puppeteer
- Keyboard input lock (prevent external keyboard input)
- Idle timeout with auto-reset (return to home after N seconds)
- Touch calibration settings
- On-screen keyboard for text input

**Technical Approach:**
- **Client:** Puppeteer touch events, idle detection
- **Configuration:** Per-device kiosk settings

**Acceptance Criteria:**
- [ ] Device responds to touch input
- [ ] Idle timeout resets to home page after 60 seconds
- [ ] External keyboard locked (configurable)
- [ ] On-screen keyboard appears for text inputs
- [ ] Touch calibration settings in admin UI

---

## 📅 Development Timeline (Estimate)

**Phase 7 Remaining:** ~4 weeks
- Week 1: Content Preview
- Week 2-3: Mobile-Responsive UI
- Week 4: Audit Logging

**Phase 8:** ~8 weeks
- Week 1-3: Advanced Analytics Dashboard
- Week 4-5: Alert System
- Week 6-8: Multi-Zone Layouts

**Phase 9:** ~10 weeks
- Week 1-4: Dynamic Data Feeds
- Week 5-8: Conditional Content Rules
- Week 9-10: Touch Screen Kiosk Enhancements

**Total Estimated Timeline:** ~22 weeks (5.5 months)

---

## 🎯 Priority Recommendations

**Immediate (Next 2 weeks):**
1. **Content Preview** - Quick win, high user value
2. **Mobile-Responsive UI** - Critical for on-site management

**Short-term (Next 1-2 months):**
3. **Audit Logging** - Enterprise requirement
4. **Advanced Analytics Dashboard** - Competitive differentiator

**Medium-term (Next 3-4 months):**
5. **Alert System** - Proactive monitoring
6. **Multi-Zone Layouts** - Advanced use cases

**Long-term (Next 5-6 months):**
7. **Dynamic Data Feeds** - Integration capabilities
8. **Conditional Content Rules** - Smart automation
9. **Touch Screen Kiosk Enhancements** - Interactive experiences

---

## 📊 Feature Status Summary

- **Completed:** 10 features (Phase 0, Phase 6, Phase 7 partial)
- **In Progress:** 0 features
- **Pending:** 9 features (Phase 7-9)
- **Total Roadmap:** 19 features

**Progress:** 52% complete (10/19 features)

---

## 🔄 Maintenance & Updates

This TODO.md file is maintained alongside the TodoWrite tool in development sessions. After completing each feature:

1. Mark feature as completed in this file (add ✅ and move to "Completed Features" section)
2. Update the TodoWrite tool to reflect completion
3. Update CLAUDE.md with implementation details
4. Create git tag for release if feature is user-facing
5. Update COMPETITIVE-ANALYSIS.md if feature changes competitive position

**Last major update:** 2025-12-29 (Added device tagging, drag-and-drop completion)

## ✅ Minor Tweaks - Completed (2025-12-29)
1. ✅ Regenerate cached content thumbnails - Already implemented with "Rebuild Thumbnails" button in ContentPage
2. ✅ Remove red "LIVE" box from remote sessions - Removed badge that was obscuring clickable areas (LiveRemoteControl.tsx:226)
3. ✅ Fix tag selector overflow - Changed to fixed positioning with viewport coordinates (TagSelector.tsx)

## 🔧 Minor Tweaks - Pending
4. Import and export functionality for playlists, content, devices (and configurations)
5. Image Support: Native support for static assets (JPG, PNG, WebP) alongside existing video and web URL support
6. Remote Storage Support: Integration with external providers (AWS S3, Google Drive, or Dropbox). Goal: Allow users to manage content via their existing cloud folders, which automatically sync to the theiacast player
7. Configurable broadcast settings, e.g. background, logo and broadcast to tags

