# AGENTS.md — ThreadsLux Architecture Guide

This file is for AI agents that work on this codebase in future sessions.

## Project Type

Static single-page application (no build step, no framework). ES modules loaded directly in the browser via `<script type="module">`. Firebase is loaded from the CDN (`gstatic.com`).

## Directory Layout

```
/
├── index.html          — Full HTML shell with all page sections
├── style.css           — All styles (mobile-first, CSS custom properties)
├── app.js              — Main application logic (routing, data, rendering)
├── firebase.js         — Firebase initialization + re-exports
├── firestore.rules     — Firestore security rules (deploy to Firebase Console)
├── database.rules.json — Realtime Database rules (deploy to Firebase Console)
├── rtdb-seed.json      — Seed data for Realtime Database footer settings
├── netlify.toml        — Netlify publish config + security headers
├── README.md
└── AGENTS.md
```

## Architecture Decisions

### Single HTML + manual router
There is no client-side router library. Navigation is handled by `navigateTo(page)` in `app.js` which toggles `hidden` CSS classes. Admin navigation uses `navigateAdmin(page)`. Both user and admin interfaces live in `index.html`; only one is visible at a time.

### Admin detection
`state.isAdmin` is set in the `onAuthStateChanged` callback by comparing `user.uid === ADMIN_UID`. This is a **UX shortcut only** — real security is enforced by Firestore Security Rules in `firestore.rules` which check the same UID server-side. Never trust client-only checks.

### Firebase config
The config in `firebase.js` uses placeholder values (`YOUR_API_KEY`, etc.). The user must replace these with their real Firebase project config. The `ADMIN_UID` constant is hardcoded to `pZ16DY2C8cV2P4S4wd7Z4B6qBKH3`.

### Realtime Database usage
RTDB is used only for `settings/footer` — the store name, tagline, address, phone, email, and copyright text. This node is publicly readable so the footer loads without auth. Writes require admin UID (enforced in `database.rules.json`). Firestore is used for all other data (products, orders, carts, wishlist, users).

### State management
`state` is a plain JS object in `app.js`. No reactive framework. Data is loaded into `state.products`, `state.cart`, etc. and then DOM is re-rendered imperatively.

### Rendering
Products are rendered as HTML strings (`.innerHTML = ...`). `escHtml()` is used for all user-supplied string interpolation to prevent XSS.

### CSS theming
Dark/light mode uses `[data-theme]` attribute on `<html>` with CSS custom properties. Theme is toggled and persisted in `localStorage`.

## Key Functions (app.js)

| Function | Purpose |
|---|---|
| `initAuth()` | Sets up auth form handlers and `onAuthStateChanged` |
| `initUserApp()` | Bootstraps user-facing UI after login |
| `initAdminApp()` | Bootstraps admin dashboard after admin login |
| `navigateTo(page)` | User-side page routing |
| `navigateAdmin(page)` | Admin-side panel routing |
| `loadProducts()` | Fetches all products from Firestore into `state.products` |
| `addToCart(id, qty, size)` | Writes cart doc to Firestore |
| `toggleWishlist(productId)` | Creates/deletes wishlist doc |
| `saveProduct(e)` | Admin: creates or updates a product in Firestore |
| `saveSettings(e)` | Admin: writes footer data to RTDB |
| `loadFooterSettings()` | User: subscribes to RTDB footer via `onValue` |

## Adding New Features

- **New user page**: Add an HTML section in `index.html` with `id="page-<name>"`, add a case to `navigateTo()`, wire up navigation links with `data-nav="<name>"`.
- **New admin panel**: Add an HTML section with `id="admin-page-<name>"`, add a nav link with `data-admin-nav="<name>"`, add a case to `navigateAdmin()`.
- **New Firestore collection**: Add security rules to `firestore.rules` before writing any data.
- **New RTDB node**: Update `database.rules.json` and `rtdb-seed.json`.

## Coding Conventions

- No TypeScript, no bundler.
- All DOM manipulation is direct (`document.getElementById`, `innerHTML`).
- Always sanitize user-controlled values with `escHtml()` before interpolating into HTML strings.
- Keep Firebase operations in `app.js`; `firebase.js` only exports SDK objects and re-exports SDK functions.
- `window.__adminXxx` functions are used for inline `onclick` attributes in dynamically-generated admin table rows.
