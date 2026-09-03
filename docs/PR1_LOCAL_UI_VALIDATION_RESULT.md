# PR #1 Local UI Validation Result

- Date: 2026-07-29
- Browser: Codex in-app Browser
- Database: migrated disposable MySQL 8.4 green fixture
- Authentication: temporary localhost-only signed session
- External data: none

## Validated flows

- Public login UI renders without application errors.
- A signed-in user without a contractor profile is blocked by mandatory company
  onboarding.
- Company name and phone are required; address is optional.
- Completing onboarding opens the dashboard and remains complete after refresh.
- Rent and sale apartments can be created from the UI.
- Adding a rental changes the apartment status from available to rented.
- Adding a sale changes the apartment status from available to sold.
- Settings persist after refresh, including AED currency and English language.
- The document direction changes to `ltr` for English and the sidebar follows the
  language direction (`right` for Arabic, `left` for English).
- With maintenance alerts disabled, maintenance creation produces no
  notification.
- With maintenance alerts enabled, maintenance creation produces exactly one
  notification, which can be marked as read.
- The analytics page reports 2 total apartments, 1 rented, and 1 sold.
- Logout clears the local session and redirects to `/login`.
- A final clean Browser run loaded apartment details, analytics, and logout with
  no console warnings or errors.
- The final server log contained no application errors. The only stderr entry was
  a development dependency data-freshness notice from
  `baseline-browser-mapping`.

## Issues found and fixed during Browser validation

- Corrected the RTL sidebar side so controls are not hidden under the sidebar.
- Made the apartment creation trigger reachable in both directions.
- Read rental and sale submission values from the submitted form and refreshed
  dependent queries after mutations.
- Refreshed maintenance and notification queries after maintenance creation.
- Returned `null` instead of `undefined` for absent rental and sale records.
- Redirected logout to the login page and removed the deprecated cookie-clear
  option.
- Loaded analytics only when both analytics environment values are configured.

External OAuth provider end-to-end testing remains a later deployment gate. No
authentication bypass was committed.
