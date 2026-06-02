# ThreadsLux — Clothing E-commerce App

A production-ready single-page clothing e-commerce application built with vanilla HTML/CSS/JavaScript and Firebase as the backend.

## Features

- **Customer storefront** — Browse products, filter by category, search, add to cart, manage wishlist, checkout, view order history, edit profile
- **Admin dashboard** — Full product/order/user management, store settings, live footer editing
- **Firebase Auth** — Email/password + Google sign-in, persistent sessions
- **Firestore** — Products, orders, carts, wishlist, user profiles
- **Realtime Database** — Live store settings (footer content editable from admin panel)
- **Dark / Light mode** — Persisted in localStorage

## Tech Stack

- Vanilla JS (ES modules, no build step)
- Firebase 10 (Auth, Firestore, Realtime Database)
- CSS custom properties with dark/light theme support
- Mobile-first, responsive layout

## Setup

1. **Create a Firebase project** at [firebase.google.com](https://firebase.google.com)
2. Enable **Authentication** (Email/Password + Google providers)
3. Enable **Firestore** database
4. Enable **Realtime Database**
5. Copy your Firebase config into `firebase.js` (replace the placeholder values)
6. Deploy **Firestore rules** from `firestore.rules`
7. Deploy **Realtime Database rules** from `database.rules.json`
8. Optionally seed the RTDB footer data from `rtdb-seed.json`

## Admin Account

The admin account is identified by Firebase UID `pZ16DY2C8cV2P4S4wd7Z4B6qBKH3`.
Create this account in Firebase Auth with email `admin@gmail.com`, then the app will automatically show the admin dashboard on login.

## Running Locally

Serve the project with any static file server:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:3000` (or the port shown).

> **Note:** Firebase JS SDK uses ES modules, so the app must be served over HTTP (not opened as a file:// URL).
