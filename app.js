/**
 * app.js — ThreadsLux E-commerce Application
 *
 * Architecture:
 *  - Single-page app with manual routing (no framework)
 *  - Admin detection: compares current user's UID against the
 *    ADMIN_UID constant. Firestore Security Rules enforce this
 *    server-side — never trust only the client check.
 *  - All Firestore writes from admin use the verified UID.
 */

import {
  auth, db, rtdb,
  googleProvider, ADMIN_UID,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, collection, query,
  where, orderBy, limit, serverTimestamp,
  onSnapshot, increment, writeBatch,
  ref, get, set, update, onValue, push,
} from "./firebase.js";

// ─── State ────────────────────────────────────────────────────
const state = {
  user: null,
  isAdmin: false,
  products: [],
  cart: [],
  wishlist: [],
  currentProduct: null,
  selectedSize: null,
  detailQty: 1,
  currentCategory: "all",
  searchQuery: "",
  sortBy: "default",
  adminProducts: [],
  adminOrders: [],
  adminUsers: [],
  footerSettings: {},
  ordersFilter: "all",
  unsubscribeFns: [],
};

// ─── DOM Helpers ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (id) => { const el = $(id); if (el) el.classList.remove("hidden"); };
const hide = (id) => { const el = $(id); if (el) el.classList.add("hidden"); };

function toast(msg, type = "default") {
  const c = $("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function setLoading(on) {
  const ol = $("loading-overlay");
  if (on) { ol.classList.remove("hidden"); }
  else { ol.classList.add("hidden"); }
}

function formatCurrency(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status) {
  return `<span class="order-status status-${status}">${status}</span>`;
}

// ─── Theme ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = $("theme-toggle");
  const adminBtn = $("admin-theme-toggle");
  const updateIcon = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
    if (adminBtn) adminBtn.textContent = t === "dark" ? "☀️" : "🌙";
  };
  updateIcon();
  const toggle = () => {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateIcon();
  };
  btn?.addEventListener("click", toggle);
  adminBtn?.addEventListener("click", toggle);
}

// ─── Auth ─────────────────────────────────────────────────────
function initAuth() {
  // Toggle forms
  $("show-register")?.addEventListener("click", (e) => {
    e.preventDefault();
    hide("login-form");
    show("register-form");
  });
  $("show-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    hide("register-form");
    show("login-form");
  });

  // Password toggles
  $$(".toggle-pw").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = $(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.textContent = inp.type === "password" ? "👁" : "🙈";
    });
  });

  // Login
  $("btn-login")?.addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    if (!email || !password) return toast("Enter email and password", "error");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    } finally {
      setLoading(false);
    }
  });

  // Register
  $("btn-register")?.addEventListener("click", async () => {
    const name = $("reg-name").value.trim();
    const email = $("reg-email").value.trim();
    const password = $("reg-password").value;
    if (!name || !email || !password) return toast("All fields required", "error");
    if (password.length < 6) return toast("Password must be at least 6 characters", "error");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email,
        createdAt: serverTimestamp(),
        blocked: false,
        orderCount: 0,
        uid: cred.user.uid,
      });
      toast("Account created!", "success");
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    } finally {
      setLoading(false);
    }
  });

  // Google
  const googleHandler = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      // Create user doc if first time
      const userRef = doc(db, "users", cred.user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          name: cred.user.displayName || "User",
          email: cred.user.email,
          createdAt: serverTimestamp(),
          blocked: false,
          orderCount: 0,
          uid: cred.user.uid,
        });
      }
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    } finally {
      setLoading(false);
    }
  };
  $("btn-google-login")?.addEventListener("click", googleHandler);
  $("btn-google-register")?.addEventListener("click", googleHandler);

  // Logout buttons
  const logout = async () => {
    await signOut(auth);
    state.cart = [];
    state.wishlist = [];
    state.unsubscribeFns.forEach((fn) => fn());
    state.unsubscribeFns = [];
  };
  $("btn-logout-user")?.addEventListener("click", logout);
  $("btn-logout-drawer")?.addEventListener("click", logout);
  $("btn-logout-admin")?.addEventListener("click", logout);

  // Auth state
  onAuthStateChanged(auth, async (user) => {
    setLoading(true);
    state.user = user;
    if (user) {
      state.isAdmin = user.uid === ADMIN_UID;
      hide("auth-section");
      if (state.isAdmin) {
        hide("user-app");
        show("admin-app");
        initAdminApp();
      } else {
        hide("admin-app");
        show("user-app");
        await checkUserBlocked(user.uid);
        initUserApp();
      }
    } else {
      state.isAdmin = false;
      hide("user-app");
      hide("admin-app");
      show("auth-section");
    }
    setLoading(false);
  });
}

async function checkUserBlocked(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data().blocked) {
      await signOut(auth);
      toast("Your account has been blocked. Contact support.", "error");
    }
  } catch (_) {}
}

function friendlyAuthError(err) {
  const map = {
    "auth/invalid-email": "Invalid email address",
    "auth/user-not-found": "No account found with this email",
    "auth/wrong-password": "Incorrect password",
    "auth/email-already-in-use": "Email already registered",
    "auth/weak-password": "Password is too weak",
    "auth/too-many-requests": "Too many attempts — try again later",
    "auth/popup-closed-by-user": "Google sign-in cancelled",
    "auth/invalid-credential": "Invalid credentials",
  };
  return map[err.code] || err.message || "Authentication failed";
}

// ─── User App ─────────────────────────────────────────────────
function initUserApp() {
  initNavigation();
  loadFooterSettings();
  loadProducts();
  loadCartFromFirestore();
  loadWishlistFromFirestore();
  loadProfile();
  navigateTo("home");
}

// ─── Navigation ───────────────────────────────────────────────
function initNavigation() {
  // All [data-nav] links
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn || btn.closest("#admin-app")) return;
    e.preventDefault();
    const nav = btn.dataset.nav;
    const cat = btn.dataset.cat;
    if (cat) {
      state.currentCategory = cat;
      filterCategoryUI(cat);
    }
    navigateTo(nav);
  });

  // Search
  $("search-btn")?.addEventListener("click", doSearch);
  $("search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // Sort
  $("sort-select")?.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderProductsPage();
  });

  // Category bar
  $("category-bar")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    state.currentCategory = btn.dataset.cat;
    filterCategoryUI(btn.dataset.cat);
    navigateTo("products");
  });

  // Burger menu
  $("menu-toggle")?.addEventListener("click", openDrawer);
  $("drawer-close")?.addEventListener("click", closeDrawer);
  $("drawer-overlay")?.addEventListener("click", closeDrawer);
}

function openDrawer() {
  show("side-drawer");
  show("drawer-overlay");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  hide("side-drawer");
  hide("drawer-overlay");
  document.body.style.overflow = "";
}

function filterCategoryUI(cat) {
  $$(".cat-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.cat === cat);
  });
}

function doSearch() {
  const q = ($("search-input")?.value || "").trim().toLowerCase();
  state.searchQuery = q;
  if (q) {
    $("products-title").textContent = `Search: "${q}"`;
    navigateTo("products");
  }
}

function navigateTo(page) {
  closeDrawer();
  $$(".page").forEach((p) => p.classList.add("hidden"));
  $$(".bottom-nav-item").forEach((b) => b.classList.remove("active"));

  const pageEl = $(`page-${page}`);
  if (pageEl) {
    pageEl.classList.remove("hidden");
    pageEl.classList.add("active");
  }

  $$(`[data-nav="${page}"]`).forEach((b) => {
    if (b.classList.contains("bottom-nav-item")) b.classList.add("active");
  });

  window.scrollTo(0, 0);

  // Page-specific init
  if (page === "home") renderHomePage();
  if (page === "products") renderProductsPage();
  if (page === "cart") renderCart();
  if (page === "wishlist") renderWishlist();
  if (page === "orders") renderOrders();
  if (page === "profile") renderProfile();
  if (page === "checkout") renderCheckout();
}

// ─── Products ─────────────────────────────────────────────────
async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    state.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderHomePage();
    renderProductsPage();
  } catch (err) {
    toast("Failed to load products", "error");
  }
}

function getFilteredProducts() {
  let list = [...state.products];
  if (state.currentCategory !== "all") {
    list = list.filter((p) => p.category === state.currentCategory);
  }
  if (state.searchQuery) {
    list = list.filter(
      (p) =>
        p.name?.toLowerCase().includes(state.searchQuery) ||
        p.description?.toLowerCase().includes(state.searchQuery) ||
        p.category?.toLowerCase().includes(state.searchQuery)
    );
  }
  switch (state.sortBy) {
    case "price-asc": list.sort((a, b) => a.price - b.price); break;
    case "price-desc": list.sort((a, b) => b.price - a.price); break;
    case "newest": list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); break;
  }
  return list;
}

function renderHomePage() {
  const featured = state.products.filter((p) => p.featured).slice(0, 6);
  const newest = [...state.products]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 6);
  renderProductGrid("featured-products", featured);
  renderProductGrid("new-arrivals", newest);
}

function renderProductsPage() {
  const list = getFilteredProducts();
  const empty = $("products-empty");
  if (!state.searchQuery) $("products-title").textContent = `All Products (${list.length})`;
  if (list.length === 0) {
    $("all-products-grid").innerHTML = "";
    empty?.classList.remove("hidden");
  } else {
    empty?.classList.add("hidden");
    renderProductGrid("all-products-grid", list);
  }
}

function renderProductGrid(containerId, products) {
  const container = $(containerId);
  if (!container) return;
  if (!products.length) {
    container.innerHTML = `<p style="color:var(--text-muted);padding:16px">No products yet.</p>`;
    return;
  }
  container.innerHTML = products.map(productCardHTML).join("");
  attachCardHandlers(container);
}

function productCardHTML(p) {
  const inWishlist = state.wishlist.some((w) => w.productId === p.id);
  const discount = p.originalPrice && p.originalPrice > p.price
    ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
    : 0;
  return `
    <div class="product-card" data-product-id="${p.id}">
      <div class="product-card-img-wrap">
        <img class="product-card-img" src="${p.imageUrl || "https://via.placeholder.com/300x375?text=No+Image"}"
             alt="${escHtml(p.name)}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/300x375?text=No+Image'" />
        <button class="wishlist-btn ${inWishlist ? "active" : ""}"
                data-product-id="${p.id}" aria-label="Wishlist">
          ${inWishlist ? "♥" : "♡"}
        </button>
        ${discount > 0 ? `<span class="product-badge">${discount}% OFF</span>` : ""}
        ${p.stock === 0 ? `<span class="product-badge" style="background:#6b7280">Out of Stock</span>` : ""}
      </div>
      <div class="product-card-body">
        <div class="product-meta">
          <span class="product-category">${escHtml(p.category || "")}</span>
          <span class="product-rating">★ ${p.rating || "4.0"}</span>
        </div>
        <h4 class="product-name">${escHtml(p.name)}</h4>
        <div class="product-price-row">
          <span class="product-price">${formatCurrency(p.price)}</span>
          ${p.originalPrice ? `<span class="product-original-price">${formatCurrency(p.originalPrice)}</span>` : ""}
        </div>
        <button class="btn btn-primary btn-sm btn-full add-to-cart-btn"
                data-product-id="${p.id}"
                ${p.stock === 0 ? "disabled style='opacity:.5;cursor:not-allowed'" : ""}>
          ${p.stock === 0 ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>`;
}

function attachCardHandlers(container) {
  // Open detail
  container.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".add-to-cart-btn") || e.target.closest(".wishlist-btn")) return;
      const id = card.dataset.productId;
      openProductDetail(id);
    });
  });

  // Add to cart
  container.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.productId;
      await addToCart(id, 1, null);
    });
  });

  // Wishlist
  container.querySelectorAll(".wishlist-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleWishlist(btn.dataset.productId);
    });
  });
}

// ─── Product Detail ───────────────────────────────────────────
function openProductDetail(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  state.currentProduct = product;
  state.selectedSize = null;
  state.detailQty = 1;
  renderProductDetail(product);
  navigateTo("product-detail");

  $("back-from-detail")?.addEventListener("click", () => {
    navigateTo("products");
  }, { once: true });
}

function renderProductDetail(p) {
  const discount = p.originalPrice && p.originalPrice > p.price
    ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
    : 0;
  const sizes = Array.isArray(p.sizes) ? p.sizes : (p.sizes ? p.sizes.split(",").map(s => s.trim()) : []);
  const inWishlist = state.wishlist.some((w) => w.productId === p.id);

  $("product-detail-content").innerHTML = `
    <div class="detail-gallery">
      <img class="detail-main-img" id="detail-main-img"
           src="${p.imageUrl || "https://via.placeholder.com/400x500?text=No+Image"}"
           alt="${escHtml(p.name)}"
           onerror="this.src='https://via.placeholder.com/400x500?text=No+Image'" />
    </div>
    <div class="detail-info">
      <span class="detail-category">${escHtml(p.category || "")}</span>
      <h1 class="detail-name">${escHtml(p.name)}</h1>
      <div class="detail-rating">
        <span class="star-display">${starDisplay(p.rating || 4)}</span>
        <span style="font-size:13px;color:var(--text-muted)">(${p.rating || "4.0"})</span>
      </div>
      <div class="detail-price-row">
        <span class="detail-price">${formatCurrency(p.price)}</span>
        ${p.originalPrice ? `<span class="detail-original">${formatCurrency(p.originalPrice)}</span>` : ""}
        ${discount > 0 ? `<span class="detail-discount">${discount}% OFF</span>` : ""}
      </div>
      <p class="detail-description">${escHtml(p.description || "A premium quality piece from our curated collection.")}</p>

      ${sizes.length ? `
        <div class="detail-sizes">
          <h5>Select Size</h5>
          <div class="sizes-row" id="sizes-row">
            ${sizes.map((s) => `<button class="size-btn" data-size="${escHtml(s)}">${escHtml(s)}</button>`).join("")}
          </div>
        </div>` : ""}

      <div class="detail-qty">
        <span style="font-size:13px;font-weight:600;">Quantity</span>
        <div class="qty-control">
          <button class="qty-btn" id="qty-minus">−</button>
          <span class="qty-value" id="qty-display">1</span>
          <button class="qty-btn" id="qty-plus">+</button>
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn btn-primary btn-lg" id="detail-add-cart"
                ${p.stock === 0 ? "disabled style='opacity:.5'" : ""}>
          ${p.stock === 0 ? "Out of Stock" : "🛒 Add to Cart"}
        </button>
        <button class="btn btn-secondary btn-lg" id="detail-wishlist">
          ${inWishlist ? "♥ Wishlisted" : "♡ Wishlist"}
        </button>
      </div>

      <p class="stock-badge ${p.stock < 5 && p.stock > 0 ? "low" : ""} ${p.stock === 0 ? "out" : ""}">
        ${p.stock === 0 ? "Out of Stock" : p.stock < 5 ? `Only ${p.stock} left!` : `${p.stock} in stock`}
      </p>
    </div>`;

  // Size selection
  $$(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".size-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.selectedSize = btn.dataset.size;
    });
  });

  // Quantity
  $("qty-minus")?.addEventListener("click", () => {
    if (state.detailQty > 1) state.detailQty--;
    $("qty-display").textContent = state.detailQty;
  });
  $("qty-plus")?.addEventListener("click", () => {
    if (state.detailQty < (p.stock || 10)) state.detailQty++;
    $("qty-display").textContent = state.detailQty;
  });

  // Add to cart from detail
  $("detail-add-cart")?.addEventListener("click", async () => {
    if (Array.isArray(sizes) && sizes.length && !state.selectedSize) {
      toast("Please select a size", "warning");
      return;
    }
    await addToCart(p.id, state.detailQty, state.selectedSize);
  });

  // Wishlist from detail
  $("detail-wishlist")?.addEventListener("click", async () => {
    await toggleWishlist(p.id);
    const inW = state.wishlist.some((w) => w.productId === p.id);
    $("detail-wishlist").textContent = inW ? "♥ Wishlisted" : "♡ Wishlist";
  });
}

function starDisplay(rating) {
  const n = Math.round(Number(rating));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ─── Cart ─────────────────────────────────────────────────────
async function loadCartFromFirestore() {
  if (!state.user) return;
  try {
    const snap = await getDocs(
      query(collection(db, "carts"), where("userId", "==", state.user.uid))
    );
    state.cart = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateCartBadge();
  } catch (_) {}
}

async function addToCart(productId, qty, size) {
  if (!state.user) return toast("Please log in", "warning");
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  // Check if already in cart (same product + same size)
  const existing = state.cart.find(
    (c) => c.productId === productId && c.size === (size || null)
  );
  try {
    if (existing) {
      const newQty = existing.qty + qty;
      await updateDoc(doc(db, "carts", existing.id), { qty: newQty });
      existing.qty = newQty;
    } else {
      const cartDoc = await addDoc(collection(db, "carts"), {
        userId: state.user.uid,
        productId,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl || "",
        qty,
        size: size || null,
        addedAt: serverTimestamp(),
      });
      state.cart.push({
        id: cartDoc.id,
        userId: state.user.uid,
        productId,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl || "",
        qty,
        size: size || null,
      });
    }
    toast(`${product.name} added to cart!`, "success");
    updateCartBadge();
  } catch (err) {
    toast("Failed to add to cart", "error");
  }
}

async function updateCartQty(cartItemId, delta) {
  const item = state.cart.find((c) => c.id === cartItemId);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    await removeFromCart(cartItemId);
    return;
  }
  try {
    await updateDoc(doc(db, "carts", cartItemId), { qty: newQty });
    item.qty = newQty;
    updateCartBadge();
    renderCart();
  } catch (_) {}
}

async function removeFromCart(cartItemId) {
  try {
    await deleteDoc(doc(db, "carts", cartItemId));
    state.cart = state.cart.filter((c) => c.id !== cartItemId);
    updateCartBadge();
    renderCart();
  } catch (_) {}
}

function updateCartBadge() {
  const total = state.cart.reduce((s, c) => s + c.qty, 0);
  [$("cart-badge"), $("cart-badge-bottom")].forEach((el) => {
    if (el) el.textContent = total;
  });
}

function renderCart() {
  const list = $("cart-items-list");
  const summary = $("cart-summary");
  const empty = $("cart-empty");
  if (!state.cart.length) {
    if (list) list.innerHTML = "";
    if (summary) summary.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const subtotal = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const shipping = subtotal > 999 ? 0 : 99;
  const total = subtotal + shipping;

  list.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <img class="cart-item-img"
           src="${item.imageUrl || "https://via.placeholder.com/80x96?text=..."}"
           alt="${escHtml(item.name)}"
           onerror="this.src='https://via.placeholder.com/80x96?text=...'" />
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.name)}</div>
        <div class="cart-item-meta">${item.size ? "Size: " + item.size : "One Size"}</div>
        <div class="cart-item-price">${formatCurrency(item.price * item.qty)}</div>
        <div class="cart-item-controls">
          <div class="qty-control">
            <button class="qty-btn" data-cart-id="${item.id}" data-delta="-1">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-cart-id="${item.id}" data-delta="1">+</button>
          </div>
          <button class="remove-btn" data-cart-id="${item.id}">Remove</button>
        </div>
      </div>
    </div>`).join("");

  summary.innerHTML = `
    <div class="summary-title">Order Summary</div>
    <div class="summary-row"><span>Subtotal (${state.cart.length} items)</span><span class="value">${formatCurrency(subtotal)}</span></div>
    <div class="summary-row"><span>Shipping</span><span class="value ${shipping === 0 ? "summary-discount" : ""}">${shipping === 0 ? "FREE" : formatCurrency(shipping)}</span></div>
    ${shipping > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Add ₹${999 - subtotal} more for free shipping</div>` : ""}
    <div class="summary-row total"><span>Total</span><span class="value">${formatCurrency(total)}</span></div>
    <button class="btn btn-primary btn-full" style="margin-top:16px" id="proceed-checkout">Proceed to Checkout →</button>`;

  // Event listeners
  list.querySelectorAll(".qty-btn[data-cart-id]").forEach((btn) => {
    btn.addEventListener("click", () => updateCartQty(btn.dataset.cartId, parseInt(btn.dataset.delta)));
  });
  list.querySelectorAll(".remove-btn[data-cart-id]").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(btn.dataset.cartId));
  });
  $("proceed-checkout")?.addEventListener("click", () => navigateTo("checkout"));
}

// ─── Checkout ─────────────────────────────────────────────────
function renderCheckout() {
  if (!state.cart.length) {
    navigateTo("cart");
    return;
  }
  const subtotal = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const shipping = subtotal > 999 ? 0 : 99;
  const total = subtotal + shipping;

  const summaryEl = $("checkout-summary");
  summaryEl.innerHTML = `
    <div class="summary-title">Your Order</div>
    ${state.cart.map((item) => `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <img src="${item.imageUrl || ""}" style="width:52px;height:64px;object-fit:cover;border-radius:8px;background:var(--bg-elevated)"
             onerror="this.style.display='none'" />
        <div>
          <div style="font-size:14px;font-weight:600">${escHtml(item.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">Qty: ${item.qty} ${item.size ? "| " + item.size : ""}</div>
          <div style="font-size:14px;font-weight:700;color:var(--accent)">${formatCurrency(item.price * item.qty)}</div>
        </div>
      </div>`).join("")}
    <div class="divider"></div>
    <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? "FREE" : formatCurrency(shipping)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>`;

  // Pre-fill email
  if (state.user?.email) {
    const coEmail = $("co-email");
    if (coEmail) coEmail.value = state.user.email;
  }

  $("back-from-checkout")?.addEventListener("click", () => navigateTo("cart"), { once: true });
}

$("checkout-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return toast("Please log in", "warning");
  if (!state.cart.length) return;
  setLoading(true);
  try {
    const subtotal = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
    const shipping = subtotal > 999 ? 0 : 99;
    const total = subtotal + shipping;
    const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || "cod";

    const orderData = {
      userId: state.user.uid,
      userEmail: state.user.email,
      shipping: {
        firstName: $("co-fname").value,
        lastName: $("co-lname").value,
        email: $("co-email").value,
        phone: $("co-phone").value,
        address: $("co-address").value,
        city: $("co-city").value,
        zip: $("co-zip").value,
        country: $("co-country").value,
      },
      items: state.cart.map((c) => ({
        productId: c.productId,
        name: c.name,
        price: c.price,
        qty: c.qty,
        size: c.size || null,
        imageUrl: c.imageUrl || "",
      })),
      subtotal,
      shippingCost: shipping,
      total,
      paymentMethod,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "orders"), orderData);

    // Update user order count
    await updateDoc(doc(db, "users", state.user.uid), {
      orderCount: increment(1),
    });

    // Clear cart
    const batch = writeBatch(db);
    state.cart.forEach((c) => batch.delete(doc(db, "carts", c.id)));
    await batch.commit();
    state.cart = [];
    updateCartBadge();

    toast("Order placed successfully! 🎉", "success");
    navigateTo("orders");
  } catch (err) {
    toast("Failed to place order. Try again.", "error");
  } finally {
    setLoading(false);
  }
});

// ─── Wishlist ─────────────────────────────────────────────────
async function loadWishlistFromFirestore() {
  if (!state.user) return;
  try {
    const snap = await getDocs(
      query(collection(db, "wishlist"), where("userId", "==", state.user.uid))
    );
    state.wishlist = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateWishlistBadge();
  } catch (_) {}
}

async function toggleWishlist(productId) {
  if (!state.user) return toast("Please log in", "warning");
  const existing = state.wishlist.find((w) => w.productId === productId);
  const product = state.products.find((p) => p.id === productId);
  try {
    if (existing) {
      await deleteDoc(doc(db, "wishlist", existing.id));
      state.wishlist = state.wishlist.filter((w) => w.productId !== productId);
      toast("Removed from wishlist");
    } else {
      const ref2 = await addDoc(collection(db, "wishlist"), {
        userId: state.user.uid,
        productId,
        name: product?.name || "",
        addedAt: serverTimestamp(),
      });
      state.wishlist.push({ id: ref2.id, userId: state.user.uid, productId, name: product?.name || "" });
      toast("Added to wishlist ♥", "success");
    }
    updateWishlistBadge();
    // Refresh wishlist buttons in grids
    $$(`[data-product-id="${productId}"].wishlist-btn`).forEach((btn) => {
      const inW = state.wishlist.some((w) => w.productId === productId);
      btn.textContent = inW ? "♥" : "♡";
      btn.classList.toggle("active", inW);
    });
  } catch (_) {
    toast("Action failed", "error");
  }
}

function updateWishlistBadge() {
  const el = $("wishlist-badge");
  if (el) el.textContent = state.wishlist.length;
}

function renderWishlist() {
  const grid = $("wishlist-grid");
  const empty = $("wishlist-empty");
  const products = state.wishlist
    .map((w) => state.products.find((p) => p.id === w.productId))
    .filter(Boolean);
  if (!products.length) {
    grid.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  renderProductGrid("wishlist-grid", products);
}

// ─── Orders ───────────────────────────────────────────────────
async function renderOrders() {
  if (!state.user) return;
  const list = $("orders-list");
  const empty = $("orders-empty");
  list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">Loading orders…</div>`;
  try {
    const snap = await getDocs(
      query(
        collection(db, "orders"),
        where("userId", "==", state.user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!orders.length) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    list.innerHTML = orders.map((o) => `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-id">Order #${o.id.slice(-8).toUpperCase()}</div>
            <div class="order-date">${formatDate(o.createdAt)}</div>
          </div>
          ${statusBadge(o.status || "pending")}
        </div>
        <div class="order-items-preview">
          ${(o.items || []).map((item) => `
            <img class="order-item-thumb"
                 src="${item.imageUrl || ""}"
                 alt="${escHtml(item.name)}"
                 title="${escHtml(item.name)} x${item.qty}"
                 onerror="this.style.display='none'" />`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--text-muted)">${(o.items || []).length} item(s) · ${o.paymentMethod?.toUpperCase() || "COD"}</span>
          <span class="order-total">${formatCurrency(o.total)}</span>
        </div>
      </div>`).join("");
  } catch (err) {
    list.innerHTML = `<p style="padding:24px;color:var(--red)">Failed to load orders.</p>`;
  }
}

// ─── Profile ──────────────────────────────────────────────────
async function loadProfile() {
  if (!state.user) return;
  $("profile-name").textContent = state.user.displayName || "User";
  $("profile-email").textContent = state.user.email || "";
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    if (snap.exists()) {
      const d = snap.data();
      if ($("pf-name")) $("pf-name").value = d.name || "";
      if ($("pf-phone")) $("pf-phone").value = d.phone || "";
      if ($("pf-address")) $("pf-address").value = d.address || "";
    }
  } catch (_) {}
}

function renderProfile() {
  $("profile-name").textContent = state.user?.displayName || "User";
  $("profile-email").textContent = state.user?.email || "";
}

$("profile-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  setLoading(true);
  try {
    const name = $("pf-name").value.trim();
    await updateDoc(doc(db, "users", state.user.uid), {
      name,
      phone: $("pf-phone").value.trim(),
      address: $("pf-address").value.trim(),
    });
    if (name) {
      await updateProfile(state.user, { displayName: name });
      $("profile-name").textContent = name;
    }
    toast("Profile updated!", "success");
  } catch (_) {
    toast("Failed to update profile", "error");
  } finally {
    setLoading(false);
  }
});

// ─── Footer from Realtime DB ──────────────────────────────────
function loadFooterSettings() {
  const footerRef = ref(rtdb, "settings/footer");
  onValue(footerRef, (snap) => {
    const d = snap.val() || {};
    state.footerSettings = d;
    if (d.shopName) $("footer-shop-name").textContent = d.shopName;
    if (d.tagline) $("footer-tagline").textContent = d.tagline;
    if (d.address) $("footer-address").textContent = d.address;
    if (d.phone) $("footer-phone").textContent = d.phone;
    if (d.email) $("footer-email-display").textContent = d.email;
    if (d.copyright) $("footer-copyright").textContent = d.copyright;
  });
}

// ─── ADMIN APP ────────────────────────────────────────────────
function initAdminApp() {
  // Admin navigation
  $$("[data-admin-nav]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.dataset.adminNav;
      navigateAdmin(page);
    });
  });

  // Mobile sidebar toggle
  $("admin-menu-toggle")?.addEventListener("click", () => {
    $("admin-sidebar")?.classList.toggle("open");
  });

  $("refresh-dashboard")?.addEventListener("click", loadAdminDashboard);

  // Orders filter
  $("orders-filter")?.addEventListener("change", (e) => {
    state.ordersFilter = e.target.value;
    renderAdminOrders();
  });

  // Product modal
  $("btn-add-product")?.addEventListener("click", () => openProductModal());
  $("product-modal-close")?.addEventListener("click", closeProductModal);
  $("product-modal-overlay")?.addEventListener("click", closeProductModal);
  $("product-form-cancel")?.addEventListener("click", closeProductModal);
  $("product-form")?.addEventListener("submit", saveProduct);

  // Settings form
  $("settings-form")?.addEventListener("submit", saveSettings);

  loadAdminDashboard();
  loadAdminProducts();
  loadAdminOrders();
  loadAdminUsers();
  loadSettingsForm();
  navigateAdmin("dashboard");
}

function navigateAdmin(page) {
  $$(".admin-page").forEach((p) => { p.classList.remove("active"); p.style.display = "none"; });
  $$(".admin-nav-item").forEach((a) => a.classList.remove("active"));
  const pageEl = $(`admin-page-${page}`);
  if (pageEl) { pageEl.style.display = "block"; pageEl.classList.add("active"); }
  $$(`[data-admin-nav="${page}"]`).forEach((a) => a.classList.add("active"));
  $("admin-sidebar")?.classList.remove("open");
}

// ─── Admin Dashboard ──────────────────────────────────────────
async function loadAdminDashboard() {
  try {
    const [usersSnap, productsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "products")),
      getDocs(collection(db, "orders")),
    ]);
    const orders = ordersSnap.docs.map((d) => d.data());
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    $("stat-users").textContent = usersSnap.size;
    $("stat-products").textContent = productsSnap.size;
    $("stat-orders").textContent = ordersSnap.size;
    $("stat-revenue").textContent = formatCurrency(revenue);

    // Recent orders table
    const recentOrders = ordersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10);

    $("recent-orders-body").innerHTML = recentOrders.map((o) => `
      <tr>
        <td><code>#${o.id.slice(-8).toUpperCase()}</code></td>
        <td>${escHtml(o.shipping?.firstName || "")} ${escHtml(o.shipping?.lastName || "")}</td>
        <td>${formatCurrency(o.total)}</td>
        <td>${statusBadge(o.status || "pending")}</td>
        <td>${formatDate(o.createdAt)}</td>
      </tr>`).join("");
  } catch (err) {
    toast("Failed to load dashboard", "error");
  }
}

// ─── Admin Products ───────────────────────────────────────────
async function loadAdminProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    state.adminProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdminProductsTable();
  } catch (_) {}
}

function renderAdminProductsTable() {
  const tbody = $("admin-products-body");
  if (!tbody) return;
  tbody.innerHTML = state.adminProducts.map((p) => `
    <tr>
      <td><img class="table-product-img" src="${p.imageUrl || ""}" alt="" onerror="this.style.display='none'" /></td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.category || "")}</td>
      <td>${formatCurrency(p.price)}</td>
      <td>${p.stock ?? "—"}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn action-edit" data-product-id="${p.id}" onclick="window.__adminEditProduct('${p.id}')">Edit</button>
          <button class="action-btn action-delete" onclick="window.__adminDeleteProduct('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>`).join("");
}

function openProductModal(productId = null) {
  const form = $("product-form");
  form.reset();
  $("pf-id").value = "";
  $("product-modal-title").textContent = "Add Product";
  if (productId) {
    const p = state.adminProducts.find((x) => x.id === productId);
    if (!p) return;
    $("product-modal-title").textContent = "Edit Product";
    $("pf-id").value = p.id;
    $("pf-name-input").value = p.name || "";
    $("pf-category").value = p.category || "";
    $("pf-price").value = p.price || "";
    $("pf-original-price").value = p.originalPrice || "";
    $("pf-description").value = p.description || "";
    $("pf-image").value = p.imageUrl || "";
    $("pf-stock").value = p.stock ?? "";
    $("pf-rating").value = p.rating || 4.0;
    $("pf-sizes").value = Array.isArray(p.sizes) ? p.sizes.join(", ") : (p.sizes || "");
    $("pf-featured").checked = !!p.featured;
  }
  show("product-modal");
}

function closeProductModal() { hide("product-modal"); }

async function saveProduct(e) {
  e.preventDefault();
  setLoading(true);
  const id = $("pf-id").value;
  const sizes = $("pf-sizes").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const data = {
    name: $("pf-name-input").value.trim(),
    category: $("pf-category").value,
    price: parseFloat($("pf-price").value),
    originalPrice: parseFloat($("pf-original-price").value) || null,
    description: $("pf-description").value.trim(),
    imageUrl: $("pf-image").value.trim(),
    stock: parseInt($("pf-stock").value),
    rating: parseFloat($("pf-rating").value) || 4.0,
    sizes,
    featured: $("pf-featured").checked,
    updatedAt: serverTimestamp(),
  };
  try {
    if (id) {
      await updateDoc(doc(db, "products", id), data);
      const idx = state.adminProducts.findIndex((p) => p.id === id);
      if (idx !== -1) state.adminProducts[idx] = { id, ...data };
      toast("Product updated!", "success");
    } else {
      data.createdAt = serverTimestamp();
      const ref2 = await addDoc(collection(db, "products"), data);
      state.adminProducts.push({ id: ref2.id, ...data });
      toast("Product added!", "success");
    }
    renderAdminProductsTable();
    closeProductModal();
    // Also refresh user-facing product list
    await loadProducts();
  } catch (err) {
    toast("Failed to save product", "error");
  } finally {
    setLoading(false);
  }
}

// Expose to inline onclick (table rows use these)
window.__adminEditProduct = (id) => openProductModal(id);
window.__adminDeleteProduct = async (id) => {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  setLoading(true);
  try {
    await deleteDoc(doc(db, "products", id));
    state.adminProducts = state.adminProducts.filter((p) => p.id !== id);
    renderAdminProductsTable();
    toast("Product deleted", "success");
    await loadProducts();
  } catch (_) {
    toast("Failed to delete product", "error");
  } finally {
    setLoading(false);
  }
};

// ─── Admin Orders ─────────────────────────────────────────────
async function loadAdminOrders() {
  try {
    const snap = await getDocs(
      query(collection(db, "orders"), orderBy("createdAt", "desc"))
    );
    state.adminOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdminOrders();
  } catch (_) {}
}

function renderAdminOrders() {
  const tbody = $("admin-orders-body");
  if (!tbody) return;
  const filtered = state.ordersFilter === "all"
    ? state.adminOrders
    : state.adminOrders.filter((o) => o.status === state.ordersFilter);

  tbody.innerHTML = filtered.map((o) => `
    <tr>
      <td><code>#${o.id.slice(-8).toUpperCase()}</code></td>
      <td>${escHtml((o.shipping?.firstName || "") + " " + (o.shipping?.lastName || ""))}<br/>
          <span style="font-size:12px;color:var(--text-muted)">${escHtml(o.userEmail || "")}</span></td>
      <td>${(o.items || []).length} item(s)</td>
      <td>${formatCurrency(o.total)}</td>
      <td>${statusBadge(o.status || "pending")}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td>
        <select class="status-select" data-order-id="${o.id}" onchange="window.__adminUpdateOrderStatus('${o.id}', this.value)">
          ${["pending","processing","shipped","delivered","cancelled"].map(
            (s) => `<option value="${s}" ${o.status === s ? "selected" : ""}>${capitalize(s)}</option>`
          ).join("")}
        </select>
      </td>
    </tr>`).join("");
}

window.__adminUpdateOrderStatus = async (orderId, newStatus) => {
  setLoading(true);
  try {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    const o = state.adminOrders.find((x) => x.id === orderId);
    if (o) o.status = newStatus;
    renderAdminOrders();
    toast(`Order status updated to ${newStatus}`, "success");
  } catch (_) {
    toast("Failed to update status", "error");
  } finally {
    setLoading(false);
  }
};

// ─── Admin Users ──────────────────────────────────────────────
async function loadAdminUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    state.adminUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdminUsers();
  } catch (_) {}
}

function renderAdminUsers() {
  const tbody = $("admin-users-body");
  if (!tbody) return;
  tbody.innerHTML = state.adminUsers.map((u) => `
    <tr>
      <td>${escHtml(u.name || "—")}</td>
      <td>${escHtml(u.email || "—")}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td>${u.orderCount || 0}</td>
      <td>
        <span class="order-status ${u.blocked ? "status-cancelled" : "status-delivered"}">
          ${u.blocked ? "Blocked" : "Active"}
        </span>
      </td>
      <td>
        <div class="table-actions">
          ${u.blocked
            ? `<button class="action-btn action-unblock" onclick="window.__adminToggleUser('${u.id}', false)">Unblock</button>`
            : `<button class="action-btn action-block" onclick="window.__adminToggleUser('${u.id}', true)">Block</button>`}
        </div>
      </td>
    </tr>`).join("");
}

window.__adminToggleUser = async (userId, block) => {
  if (!confirm(`${block ? "Block" : "Unblock"} this user?`)) return;
  setLoading(true);
  try {
    await updateDoc(doc(db, "users", userId), { blocked: block });
    const u = state.adminUsers.find((x) => x.id === userId);
    if (u) u.blocked = block;
    renderAdminUsers();
    toast(`User ${block ? "blocked" : "unblocked"}`, "success");
  } catch (_) {
    toast("Failed to update user", "error");
  } finally {
    setLoading(false);
  }
};

// ─── Admin Settings (Footer / Store info) ─────────────────────
async function loadSettingsForm() {
  const footerRef = ref(rtdb, "settings/footer");
  const snap = await get(footerRef);
  const d = snap.val() || {};
  $("st-shop-name").value = d.shopName || "ThreadsLux";
  $("st-tagline").value = d.tagline || "Premium fashion for everyone.";
  $("st-copyright").value = d.copyright || `© ${new Date().getFullYear()} ThreadsLux. All rights reserved.`;
  $("st-address").value = d.address || "123 Fashion Street, Mumbai";
  $("st-phone").value = d.phone || "+91 98765 43210";
  $("st-email").value = d.email || "hello@threadslux.com";
}

async function saveSettings(e) {
  e.preventDefault();
  setLoading(true);
  try {
    const footerRef = ref(rtdb, "settings/footer");
    await set(footerRef, {
      shopName: $("st-shop-name").value.trim(),
      tagline: $("st-tagline").value.trim(),
      copyright: $("st-copyright").value.trim(),
      address: $("st-address").value.trim(),
      phone: $("st-phone").value.trim(),
      email: $("st-email").value.trim(),
    });
    toast("Settings saved! Footer updated live.", "success");
  } catch (_) {
    toast("Failed to save settings", "error");
  } finally {
    setLoading(false);
  }
}

// ─── Utilities ────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Bootstrap ────────────────────────────────────────────────
initTheme();
initAuth();
