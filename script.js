import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0WEqRFErpLgk6WF0pSSIHfxZAGgRL4TY",
  authDomain: "orvellomonte-392cf.firebaseapp.com",
  projectId: "orvellomonte-392cf",
  storageBucket: "orvellomonte-392cf.firebasestorage.app",
  messagingSenderId: "339066151675",
  appId: "1:339066151675:web:e442741f0d64d50c2f065e",
  measurementId: "G-E6CFZJCMZC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_EMAIL = "orvellomonte@gmail.com";
const isAdminPage = document.body.dataset.adminPage === "true";

const canUseAnalytics = window.location.protocol === "https:" && !window.location.hostname.includes("localhost");

if (canUseAnalytics) {
  import("https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js")
    .then(({ getAnalytics, isSupported }) => isSupported().then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    }))
    .catch(() => {});
}

const cartCounter = document.querySelector(".cart-link span");
const cartButton = document.querySelector(".cart-link");
const cartDrawer = document.querySelector(".cart-drawer");
const cartItems = document.querySelector(".cart-items");
const cartEmpty = document.querySelector(".cart-empty");
const cartSummary = document.querySelector(".cart-summary");
const cartSubtotal = document.querySelector(".cart-subtotal");
const clearCartButton = document.querySelector(".clear-cart-button");
const checkoutButton = document.querySelector(".checkout-button");
const checkoutModal = document.querySelector(".checkout-modal");
const checkoutForm = document.querySelector(".checkout-form");
const checkoutMessage = document.querySelector(".checkout-message");
const checkoutOrderSummary = document.querySelector(".checkout-order-summary");
const signupForm = document.querySelector(".signup-form");
const accountButton = document.querySelector(".account-button");
const authModal = document.querySelector(".auth-modal");
const authPanel = document.querySelector(".auth-panel");
const authForm = document.querySelector(".auth-form");
const authTitle = document.querySelector("#auth-title");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const authSubmit = document.querySelector(".auth-submit");
const authMessage = document.querySelector(".auth-message");
const authName = document.querySelector("#auth-name");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const userPanel = document.querySelector(".user-panel");
const userName = document.querySelector(".user-name");
const userEmail = document.querySelector(".user-email");
const signOutButton = document.querySelector(".sign-out-button");
const sideMenu = document.querySelector(".side-menu");
const menuToggle = document.querySelector(".menu-toggle");
const adminLock = document.querySelector("[data-admin-lock]");
const adminOnlySections = document.querySelectorAll("[data-admin-only]");
const pageCategory = document.body.dataset.category;
const productGrid = document.querySelector("[data-product-grid]");
const adminPanel = document.querySelector(".admin-product-panel");
const adminToggleButton = document.querySelector(".admin-toggle-button");
const adminForm = document.querySelector(".admin-product-form");
const adminMessage = document.querySelector(".admin-message");
const adminImagePreview = document.querySelector(".admin-image-preview");
const adminSizeStocks = document.querySelector(".admin-size-stocks");
const adminOrdersList = document.querySelector("[data-admin-orders]");
const adminOrdersCount = document.querySelector(".admin-orders-count");

let cart = [];
let authMode = "login";
let currentUser = null;
let adminPreviewUrls = [];
let currentProducts = [];
let currentEditId = null;
let existingAdminImages = [];
let adminSizeRows = [];
let ordersUnsubscribe = null;

const formatPrice = (amount) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(amount);

const saveCart = () => {
  localStorage.setItem(getCartStorageKey(), JSON.stringify(cart));
};

const getCartStorageKey = (user = currentUser) => user?.uid ? `orvello-cart:${user.uid}` : "orvello-cart:guest";

const loadCart = (user = currentUser) => {
  const storageKey = getCartStorageKey(user);
  const fallbackCart = user ? "[]" : localStorage.getItem("orvello-cart") || "[]";

  try {
    return JSON.parse(localStorage.getItem(storageKey) || fallbackCart);
  } catch {
    return [];
  }
};

cart = loadCart();

const getCartCount = () => cart.reduce((total, item) => total + item.quantity, 0);

const getCartSubtotal = () => cart.reduce((total, item) => total + item.price * item.quantity, 0);

const getProductTone = (id) => {
  const tones = {
    "shadow-logo-hoodie": "hoodie",
    "night-cargo-pants": "cargo",
    "rust-graphic-tee": "tee"
  };

  return tones[id] || "hoodie";
};

const getProductImage = (product) => product.imageUrls?.[0] || product.images?.[0] || "";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const readImage = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel okunamadı."));
    };
    image.src = url;
  });

const compressImage = async (file) => {
  const image = await readImage(file);
  const maxSide = 640;
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.round(image.width * ratio);
  const height = Math.round(image.height * ratio);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#111";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.58);
  });

  if (!blob) {
    return file;
  }

  const baseName = slugify(file.name.replace(/\.[^.]+$/, "")) || "product-image";
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Görsel dönüştürülemedi."));
    reader.readAsDataURL(file);
  });

const prepareProductImages = async (files, onStatus) => {
  const imageUrls = [];

  for (let index = 0; index < files.length; index += 1) {
    onStatus(`Görsel ${index + 1}/${files.length} sıkıştırılıyor...`);
    const compressedFile = await compressImage(files[index]);
    imageUrls.push(await fileToDataUrl(compressedFile));
  }

  const totalBytes = imageUrls.reduce((sum, url) => sum + url.length, 0);

  if (totalBytes > 900000) {
    throw new Error("Görseller Firestore için hâlâ büyük. Daha az görsel seç veya görselleri biraz küçült.");
  }

  return imageUrls;
};

const renderCart = () => {
  const itemCount = getCartCount();
  cartCounter.textContent = itemCount;
  cartButton.setAttribute("aria-label", `Sepeti aç, ${itemCount} ürün`);

  cartEmpty.hidden = cart.length > 0;
  cartItems.hidden = cart.length === 0;
  cartSummary.hidden = cart.length === 0;
  cartSubtotal.textContent = formatPrice(getCartSubtotal());

  cartItems.innerHTML = cart
    .map((item) => `
      <article class="cart-item">
        <div class="cart-item-visual ${item.imageUrl ? "cart-item-photo" : item.tone || getProductTone(item.id)}" aria-hidden="true">
          ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : ""}
        </div>
        <div class="cart-item-main">
          <div class="cart-item-top">
            <div>
              <h3>${item.name}</h3>
              <p class="cart-item-price">${formatPrice(item.price)}${item.size ? ` / ${escapeHtml(item.size)}` : ""}</p>
            </div>
            <button class="remove-item-button" type="button" aria-label="${item.name} ürününü kaldır" data-remove-item="${item.id}">×</button>
          </div>
          <div class="cart-item-bottom">
            <div class="quantity-control" aria-label="${item.name} adet">
              <button class="quantity-button" type="button" aria-label="Adedi azalt" data-quantity-action="decrease" data-item-id="${item.id}">−</button>
              <span class="quantity-value">${item.quantity}</span>
              <button class="quantity-button" type="button" aria-label="Adedi artır" data-quantity-action="increase" data-item-id="${item.id}">+</button>
            </div>
            <span class="cart-line-total">${formatPrice(item.price * item.quantity)}</span>
          </div>
        </div>
      </article>
    `)
    .join("");

  if (document.body.classList.contains("checkout-open")) {
    renderCheckoutSummary();
  }
};

const openCart = () => {
  document.body.classList.add("cart-open");
  cartDrawer.setAttribute("aria-hidden", "false");
};

const closeCart = () => {
  document.body.classList.remove("cart-open");
  cartDrawer.setAttribute("aria-hidden", "true");
};

const setCheckoutMessage = (message, isError = false) => {
  if (!checkoutMessage) {
    return;
  }

  checkoutMessage.textContent = message;
  checkoutMessage.classList.toggle("error", isError);
};

const renderCheckoutSummary = () => {
  if (!checkoutOrderSummary) {
    return;
  }

  if (cart.length === 0) {
    checkoutOrderSummary.innerHTML = "<p>Sepetin boş.</p>";
    return;
  }

  checkoutOrderSummary.innerHTML = `
    <div class="checkout-summary-head">
      <span>Sipariş Özeti</span>
      <strong>${formatPrice(getCartSubtotal())}</strong>
    </div>
    <div class="checkout-summary-items">
      ${cart.map((item) => `
        <div class="checkout-summary-item">
          <span>${escapeHtml(item.name)}</span>
          <small>${escapeHtml(item.size || "Standart")} / ${item.quantity} adet</small>
        </div>
      `).join("")}
    </div>
  `;
};

const openCheckout = () => {
  if (!checkoutModal || !checkoutForm) {
    return;
  }

  if (cart.length === 0) {
    return;
  }

  renderCheckoutSummary();
  setCheckoutMessage("");
  document.body.classList.add("checkout-open");
  checkoutModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => checkoutForm.elements.fullName?.focus(), 50);
};

const closeCheckout = () => {
  if (!checkoutModal) {
    return;
  }

  document.body.classList.remove("checkout-open");
  checkoutModal.setAttribute("aria-hidden", "true");
};

const buildOrderItems = () => cart.map((item) => ({
  cartItemId: item.id,
  productId: item.productId || item.id,
  name: item.name,
  size: item.size || "Standart",
  imageUrl: item.imageUrl || "",
  price: Number(item.price || 0),
  quantity: Number(item.quantity || 1)
}));

const openSideMenu = () => {
  if (!sideMenu || !menuToggle) {
    return;
  }

  sideMenu.classList.add("is-open");
  document.body.classList.add("menu-open");
  sideMenu.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-expanded", "true");
};

const closeSideMenu = () => {
  if (!sideMenu || !menuToggle) {
    return;
  }

  sideMenu.classList.remove("is-open");
  document.body.classList.remove("menu-open");
  sideMenu.setAttribute("aria-hidden", "true");
  menuToggle.setAttribute("aria-expanded", "false");
};

const addToCart = (product, maxStock = Infinity) => {
  const existingItem = cart.find((item) => item.id === product.id);

  if (existingItem) {
    if (existingItem.quantity >= maxStock) {
      return false;
    }

    existingItem.maxStock = maxStock;
    existingItem.quantity += 1;
  } else {
    cart.push({ ...product, maxStock, quantity: 1 });
  }

  saveCart();
  renderCart();
  return true;
};

const updateQuantity = (id, action) => {
  cart = cart
    .map((item) => {
      if (item.id !== id) {
        return item;
      }

      const nextQuantity = action === "increase" ? item.quantity + 1 : item.quantity - 1;
      const maxStock = Number(item.maxStock || Infinity);
      const quantity = action === "increase" ? Math.min(nextQuantity, maxStock) : nextQuantity;
      return { ...item, quantity };
    })
    .filter((item) => item.quantity > 0);

  saveCart();
  renderCart();
};

const removeItem = (id) => {
  cart = cart.filter((item) => item.id !== id);
  saveCart();
  renderCart();
};

const parseJsonData = (value, fallback = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

document.addEventListener("click", (event) => {
  const productButton = event.target.closest("[data-product]");
  const aboutButton = event.target.closest("[data-about-toggle]");
  const galleryButton = event.target.closest("[data-gallery-image]");
  const sizeOptionButton = event.target.closest("[data-size-option]");
  const editProductButton = event.target.closest("[data-admin-edit-product]");
  const deleteProductButton = event.target.closest("[data-admin-delete-product]");

  if (editProductButton) {
    editProduct(editProductButton.dataset.adminEditProduct);
    return;
  }

  if (deleteProductButton) {
    deleteProduct(deleteProductButton.dataset.adminDeleteProduct);
    return;
  }

  if (aboutButton) {
    const aboutText = aboutButton.closest(".product-meta")?.querySelector(".product-about");

    if (aboutText) {
      aboutText.hidden = !aboutText.hidden;
      aboutButton.textContent = aboutText.hidden ? "Hakkında" : "Kapat";
    }
  }

  if (galleryButton) {
    const productCard = galleryButton.closest(".product-card");
    const mainImage = productCard?.querySelector(".product-photo img");

    if (mainImage) {
      mainImage.src = galleryButton.dataset.galleryImage;
      productCard.querySelectorAll("[data-gallery-image]").forEach((button) => {
        button.classList.toggle("active", button === galleryButton);
      });
    }
  }

  if (sizeOptionButton) {
    const productCard = sizeOptionButton.closest(".product-card");

    productCard?.querySelectorAll("[data-size-option]").forEach((button) => {
      button.classList.toggle("active", button === sizeOptionButton);
    });
    return;
  }

  if (productButton) {
    const productCard = productButton.closest(".product-card");
    const selectedSize = productCard?.querySelector("[data-size-option].active")?.dataset.sizeOption || "Standart";
    const baseId = productButton.dataset.id;
    const originalText = productButton.textContent;
    const stock = Number(productButton.dataset.stock || 0);
    const sizeStocks = parseJsonData(productButton.dataset.sizeStocks);
    const stockForSelection = Number(sizeStocks[selectedSize] ?? stock);

    if (stock <= 0 || stockForSelection <= 0) {
      productButton.textContent = "Stok Yok";
      window.setTimeout(() => {
        productButton.textContent = originalText;
      }, 1200);
      return;
    }

    const wasAdded = addToCart({
      id: `${baseId}-${selectedSize.toLowerCase()}`,
      productId: baseId,
      name: productButton.dataset.product,
      price: Number(productButton.dataset.price),
      tone: productButton.dataset.tone || getProductTone(baseId),
      size: selectedSize,
      imageUrl: productButton.dataset.image || ""
    }, stockForSelection);

    if (!wasAdded) {
      productButton.textContent = "Stok Limiti";
      window.setTimeout(() => {
        productButton.textContent = originalText;
      }, 1200);
      return;
    }
    productButton.textContent = "Eklendi";
    openCart();

    window.setTimeout(() => {
      productButton.textContent = originalText;
    }, 1200);
  }
});

cartButton?.addEventListener("click", () => {
  closeSideMenu();
  openCart();
});

menuToggle?.addEventListener("click", openSideMenu);

document.querySelectorAll("[data-close-menu]").forEach((button) => {
  button.addEventListener("click", closeSideMenu);
});

document.querySelectorAll(".side-menu-link").forEach((item) => {
  item.addEventListener("click", () => {
    if (!item.classList.contains("account-button") && !item.classList.contains("cart-link")) {
      closeSideMenu();
    }
  });
});

document.querySelectorAll("[data-close-cart]").forEach((button) => {
  button.addEventListener("click", closeCart);
});

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity-action]");
  const removeButton = event.target.closest("[data-remove-item]");

  if (quantityButton) {
    updateQuantity(quantityButton.dataset.itemId, quantityButton.dataset.quantityAction);
  }

  if (removeButton) {
    removeItem(removeButton.dataset.removeItem);
  }
});

clearCartButton.addEventListener("click", () => {
  cart = [];
  saveCart();
  renderCart();
});

checkoutButton.addEventListener("click", () => {
  if (cart.length === 0) {
    return;
  }

  closeCart();
  openCheckout();
});

document.querySelectorAll("[data-close-checkout]").forEach((button) => {
  button.addEventListener("click", closeCheckout);
});

checkoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (cart.length === 0) {
    setCheckoutMessage("Sepetin boş. Önce ürün ekle.", true);
    return;
  }

  const formData = new FormData(checkoutForm);
  const fullName = formData.get("fullName").trim();
  const phone = formData.get("phone").trim();
  const address = formData.get("address").trim();

  if (!fullName || !phone || !address) {
    setCheckoutMessage("Ad soyad, telefon ve adres alanlarını doldur.", true);
    return;
  }

  const submitButton = checkoutForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setCheckoutMessage("Sipariş kaydediliyor...");

  try {
    await addDoc(collection(db, "orders"), {
      customer: {
        fullName,
        phone,
        address,
        email: currentUser?.email || ""
      },
      userId: currentUser?.uid || "",
      items: buildOrderItems(),
      subtotal: getCartSubtotal(),
      status: "new",
      source: pageCategory || "site",
      createdAt: serverTimestamp()
    });

    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    renderCheckoutSummary();
    setCheckoutMessage("Sipariş alındı. Admin paneline düştü.");

    window.setTimeout(() => {
      closeCheckout();
      setCheckoutMessage("");
    }, 1600);
  } catch (error) {
    setCheckoutMessage(error.code === "permission-denied"
      ? "Sipariş kaydedilemedi: Firestore Rules içinde orders yazma iznini yayınla."
      : error.message || "Sipariş kaydedilemedi. Firebase ayarlarını kontrol et.", true);
  } finally {
    submitButton.disabled = false;
  }
});

signupForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = signupForm.querySelector("button");
  button.textContent = "Alındı";
  signupForm.reset();
});

const setMessage = (message, isError = false) => {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
};

const setAdminMessage = (message, isError = false) => {
  if (!adminMessage) {
    return;
  }

  adminMessage.textContent = message;
  adminMessage.classList.toggle("error", isError);
};

const isAdminUser = (user) => user?.email?.toLowerCase() === ADMIN_EMAIL;

const updateTotalStockInput = () => {
  if (!adminForm) {
    return 0;
  }

  const totalStock = adminSizeRows.reduce((total, item) => total + item.stock, 0);

  if (adminForm.elements.stock) {
    adminForm.elements.stock.value = String(totalStock);
  }
  return totalStock;
};

const renderAdminSizeStocks = () => {
  if (!adminSizeStocks || !adminForm) {
    return;
  }

  if (adminSizeRows.length === 0) {
    adminSizeStocks.innerHTML = `
      <div class="admin-size-stocks-empty">
        Henüz beden eklenmedi. Beden adını ve stoğunu yazıp ekle.
      </div>
    `;
    updateTotalStockInput();
    return;
  }

  adminSizeStocks.innerHTML = `
    <div class="admin-size-stocks-title">Beden stokları</div>
    ${adminSizeRows.map((item) => {
      return `
        <div class="size-stock-chip">
          <span>${escapeHtml(item.size)}</span>
          <strong>${item.stock} stok</strong>
          <button type="button" aria-label="${escapeHtml(item.size)} bedenini kaldır" data-remove-size-stock="${escapeHtml(item.size)}">×</button>
        </div>
      `;
    }).join("")}
  `;
  updateTotalStockInput();
};

const addAdminSizeStock = () => {
  if (!adminForm) {
    return;
  }

  const sizeInput = adminForm.elements.sizeName;
  const stockInput = adminForm.elements.sizeStock;
  const size = sizeInput.value.trim().toUpperCase();
  const stock = Number(stockInput.value);

  if (!size || !Number.isFinite(stock) || stock < 0) {
    setAdminMessage("Beden adı ve geçerli stok sayısı gir.", true);
    return;
  }

  const existingIndex = adminSizeRows.findIndex((item) => item.size === size);

  if (existingIndex > -1) {
    adminSizeRows[existingIndex].stock = stock;
  } else {
    adminSizeRows.push({ size, stock });
  }

  sizeInput.value = "";
  stockInput.value = "";
  sizeInput.focus();
  renderAdminSizeStocks();
  setAdminMessage(`${size} bedeni eklendi.`);
};

const removeAdminSizeStock = (size) => {
  adminSizeRows = adminSizeRows.filter((item) => item.size !== size);
  renderAdminSizeStocks();
};

const getSizeStocksFromForm = () => {
  const sizeStocks = {};

  adminSizeRows.forEach((item) => {
    sizeStocks[item.size] = item.stock;
  });

  return sizeStocks;
};

const clearAdminImagePreview = () => {
  adminPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  adminPreviewUrls = [];

  if (adminImagePreview) {
    adminImagePreview.innerHTML = "";
  }
};

const renderAdminImagePreview = (files) => {
  if (!adminImagePreview) {
    return;
  }

  clearAdminImagePreview();

  if (files.length === 0) {
    return;
  }

  adminPreviewUrls = files.map((file) => URL.createObjectURL(file));
  adminImagePreview.innerHTML = adminPreviewUrls
    .map((url, index) => `
      <figure>
        <img src="${url}" alt="Seçilen ürün görseli ${index + 1}">
        <figcaption>${index + 1}</figcaption>
      </figure>
    `)
    .join("");
};

const renderExistingAdminImagePreview = (imageUrls) => {
  if (!adminImagePreview) {
    return;
  }

  clearAdminImagePreview();

  if (imageUrls.length === 0) {
    return;
  }

  adminImagePreview.innerHTML = imageUrls
    .map((url, index) => `
      <figure>
        <img src="${escapeHtml(url)}" alt="Mevcut ürün görseli ${index + 1}">
        <figcaption>${index + 1}</figcaption>
      </figure>
    `)
    .join("");
};

const setAdminMode = (mode, productName = "") => {
  currentEditId = mode === "edit" ? currentEditId : null;
  const heading = adminForm?.querySelector(".admin-form-head h3");
  const submitButton = adminForm?.querySelector('button[type="submit"]');

  if (heading) {
    heading.textContent = mode === "edit" ? "Ürünü güncelle" : "Drop'a ürün ekle";
  }

  if (submitButton) {
    submitButton.textContent = mode === "edit" ? "Ürünü Güncelle" : "Ürünü Yayınla";
  }

  if (adminForm?.elements.images) {
    adminForm.elements.images.required = mode !== "edit";
  }

  if (mode === "edit" && productName) {
    setAdminMessage(`${productName} düzenleniyor.`);
  }
};

const resetAdminFormForCreate = () => {
  if (!adminForm) {
    return;
  }

  adminForm.reset();
  if (adminForm.elements.category) {
    adminForm.elements.category.value = "women";
  }
  currentEditId = null;
  existingAdminImages = [];
  adminSizeRows = [];
  clearAdminImagePreview();
  renderAdminSizeStocks();
  setAdminMode("create");
  setAdminMessage("");
};

const closeAdminForm = () => {
  if (!adminForm) {
    return;
  }

  adminForm.hidden = true;
  document.body.classList.remove("admin-form-open");

  if (adminToggleButton) {
    adminToggleButton.textContent = "Ürün Ekle";
  }
};

const openAdminForm = () => {
  if (!adminForm) {
    return;
  }

  adminForm.hidden = false;
  document.body.classList.add("admin-form-open");

  if (adminToggleButton) {
    adminToggleButton.textContent = "Paneli Kapat";
  }

  setAdminMessage("");
};

const renderFirebaseProduct = (product) => {
  const imageUrl = getProductImage(product);
  const imageUrls = product.imageUrls || product.images || [];
  const sizeStocks = product.sizeStocks || {};
  const sizes = product.sizes?.length ? product.sizes : Object.keys(sizeStocks).length ? Object.keys(sizeStocks) : ["S", "M", "L"];
  const stock = Number(product.stock || 0);
  const isOutOfStock = stock <= 0;
  const isAdmin = isAdminUser(currentUser) && isAdminPage;
  const firstAvailableSize = sizes.find((size) => Number(sizeStocks[size] ?? stock) > 0) || sizes[0];

  return `
  <article class="product-card" data-firestore-product="${escapeHtml(product.id)}">
    ${isAdmin ? `
      <div class="product-admin-actions" aria-label="${escapeHtml(product.name)} admin işlemleri">
        <button type="button" data-admin-edit-product="${escapeHtml(product.id)}">Düzenle</button>
        <button type="button" data-admin-delete-product="${escapeHtml(product.id)}">Sil</button>
      </div>
    ` : ""}
    <div class="product-visual ${imageUrl ? "product-photo" : escapeHtml(product.tone)}">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}">` : ""}
    </div>
    <div class="product-info">
      <h3>${escapeHtml(product.name)}</h3>
      ${imageUrls.length > 1 ? `
        <div class="product-gallery" aria-label="${escapeHtml(product.name)} görselleri">
          ${imageUrls.map((url, index) => `<button class="${index === 0 ? "active" : ""}" type="button" aria-label="Görsel ${index + 1}" data-gallery-image="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt=""></button>`).join("")}
        </div>
      ` : ""}
      <div class="product-meta">
        <div class="size-options" aria-label="${escapeHtml(product.name)} beden seçimi">
          ${sizes.map((size) => {
            const sizeStock = Number(sizeStocks[size] ?? stock);
            const canSelect = sizeStock > 0;
            return `<button class="size-option ${size === firstAvailableSize && canSelect ? "active" : ""} ${canSelect ? "" : "disabled"}" type="button" data-size-option="${escapeHtml(size)}" ${canSelect ? "" : "disabled"}>${escapeHtml(size)}</button>`;
          }).join("")}
        </div>
        <span class="stock-badge ${isOutOfStock ? "out" : ""}">${isOutOfStock ? "Stok Yok" : `${stock} stok`}</span>
        <button class="about-button" type="button" data-about-toggle>Hakkında</button>
        <p class="product-about" hidden>${escapeHtml(product.description)}</p>
      </div>
      <div class="product-row">
        <span>${formatPrice(product.price)}</span>
        <button type="button" data-product="${escapeHtml(product.name)}" data-id="${escapeHtml(product.id)}" data-price="${product.price}" data-tone="${escapeHtml(product.tone)}" data-stock="${stock}" data-size-stocks="${escapeHtml(JSON.stringify(sizeStocks))}" data-image="${escapeHtml(imageUrl)}" ${isOutOfStock ? "disabled" : ""}>${isOutOfStock ? "Stok Yok" : "Sepete Ekle"}</button>
      </div>
    </div>
  </article>
`;
};

const renderFirestoreProducts = (products) => {
  if (!productGrid) {
    return;
  }

  productGrid.querySelectorAll("[data-firestore-product]").forEach((card) => card.remove());
  productGrid.querySelector(".empty-products")?.toggleAttribute("hidden", products.length > 0);
  productGrid.insertAdjacentHTML("beforeend", products.map(renderFirebaseProduct).join(""));
};

const loadFirestoreProducts = () => {
  if (!productGrid || (!pageCategory && !isAdminPage)) {
    return;
  }

  const productQuery = pageCategory
    ? query(collection(db, "products"), where("category", "==", pageCategory))
    : collection(db, "products");

  onSnapshot(
    productQuery,
    (snapshot) => {
      const products = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => isAdminPage || product.active !== false)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      currentProducts = products;
      renderFirestoreProducts(products);
    },
    () => {
      setAdminMessage("Firestore ürünleri okunamadı. Firebase Rules ayarlarını kontrol et.", true);
    }
  );
};

const formatOrderDate = (createdAt) => {
  const date = createdAt?.toDate?.() || (createdAt?.seconds ? new Date(createdAt.seconds * 1000) : null);

  if (!date) {
    return "Yeni sipariş";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const renderAdminOrders = (orders) => {
  if (!adminOrdersList) {
    return;
  }

  if (adminOrdersCount) {
    adminOrdersCount.textContent = `${orders.length} sipariş`;
  }

  if (orders.length === 0) {
    adminOrdersList.innerHTML = `<p class="empty-orders">Henüz sipariş yok.</p>`;
    return;
  }

  adminOrdersList.innerHTML = orders.map((order) => {
    const customer = order.customer || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const customerName = customer.fullName || "İsimsiz müşteri";
    const phone = customer.phone || "Telefon yok";
    const address = customer.address || "Adres yok";

    return `
      <article class="order-package">
        <div class="order-package-head">
          <div>
            <span class="order-badge">Paket</span>
            <h4>${escapeHtml(customerName)}</h4>
            <p>${escapeHtml(formatOrderDate(order.createdAt))}</p>
          </div>
          <strong>${formatPrice(Number(order.subtotal || 0))}</strong>
        </div>
        <div class="order-customer">
          <span>Telefon: ${escapeHtml(phone)}</span>
          ${customer.email ? `<span>E-posta: ${escapeHtml(customer.email)}</span>` : ""}
          <p>${escapeHtml(address)}</p>
        </div>
        <div class="order-products">
          ${items.map((item) => `
            <div class="order-product">
              <div class="order-product-image ${item.imageUrl ? "has-image" : ""}">
                ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || "Ürün")}">` : ""}
              </div>
              <div>
                <strong>${escapeHtml(item.name || "Ürün")}</strong>
                <span>Beden: ${escapeHtml(item.size || "Standart")}</span>
                <span>Adet: ${Number(item.quantity || 1)} / ${formatPrice(Number(item.price || 0))}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
};

const loadAdminOrders = () => {
  if (ordersUnsubscribe) {
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }

  if (!adminOrdersList || !isAdminUser(currentUser)) {
    return;
  }

  adminOrdersList.innerHTML = `<p class="empty-orders">Siparişler yükleniyor...</p>`;

  ordersUnsubscribe = onSnapshot(
    collection(db, "orders"),
    (snapshot) => {
      const orders = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      renderAdminOrders(orders);
    },
    (error) => {
      adminOrdersList.innerHTML = `<p class="empty-orders error">${
        error.code === "permission-denied"
          ? "Siparişler okunamadı: Firestore Rules içinde admin okuma iznini yayınla."
          : "Siparişler okunamadı. Firebase ayarlarını kontrol et."
      }</p>`;
    }
  );
};

const editProduct = (productId) => {
  if (!isAdminUser(currentUser)) {
    setAdminMessage("Bu işlem için admin hesabıyla giriş yapmalısın.", true);
    return;
  }

  const product = currentProducts.find((item) => item.id === productId);

  if (!product || !adminForm) {
    setAdminMessage("Ürün bulunamadı.", true);
    return;
  }

  currentEditId = product.id;
  existingAdminImages = product.imageUrls || product.images || [];
  adminForm.reset();

  adminForm.elements.name.value = product.name || "";
  adminForm.elements.price.value = product.price || "";
  adminForm.elements.description.value = product.description || "";

  if (adminForm.elements.category) {
    adminForm.elements.category.value = product.category || "women";
  }

  const productSizes = product.sizes?.length ? product.sizes : Object.keys(product.sizeStocks || {});
  const normalizedProductSizes = productSizes.length ? productSizes : (Number(product.stock || 0) > 0 ? ["STANDART"] : []);
  const editSizeStocks = product.sizeStocks || normalizedProductSizes.reduce((stocks, size, index) => {
    stocks[size] = index === 0 ? Number(product.stock || 0) : 0;
    return stocks;
  }, {});

  adminSizeRows = normalizedProductSizes.map((size) => ({
    size,
    stock: Number(editSizeStocks[size] || 0)
  }));
  renderAdminSizeStocks();
  renderExistingAdminImagePreview(existingAdminImages);
  setAdminMode("edit", product.name || "Ürün");
  openAdminForm();
  setAdminMessage(`${product.name || "Ürün"} düzenleniyor. Yeni görsel seçmezsen mevcut görseller korunur.`);
};

const deleteProduct = async (productId) => {
  if (!isAdminUser(currentUser)) {
    setAdminMessage("Bu işlem için admin hesabıyla giriş yapmalısın.", true);
    return;
  }

  const product = currentProducts.find((item) => item.id === productId);
  const productName = product?.name || "Bu ürün";

  if (!window.confirm(`${productName} silinsin mi?`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "products", productId));
    setAdminMessage("Ürün silindi.");
  } catch (error) {
    setAdminMessage(error.code === "permission-denied"
      ? "Ürün silinemedi: Firestore Rules içinde admin silme iznini yayınla."
      : error.message || "Ürün silinemedi. Firebase ayarlarını kontrol et.", true);
  }
};

const setupAdminPanel = () => {
  if (!adminPanel || !adminForm || (!pageCategory && !isAdminPage)) {
    return;
  }

  adminToggleButton?.addEventListener("click", () => {
    if (adminForm.hidden) {
      resetAdminFormForCreate();
      openAdminForm();
    } else {
      closeAdminForm();
    }
  });

  document.querySelectorAll("[data-admin-close]").forEach((button) => {
    button.addEventListener("click", closeAdminForm);
  });

  adminForm.elements.images?.addEventListener("change", () => {
    const files = [...adminForm.elements.images.files];
    renderAdminImagePreview(files);

    if (files.length > 0) {
      setAdminMessage(`${files.length} görsel seçildi. Yayınlarken sıkıştırılacak.`);
    }
  });

  adminForm.querySelector("[data-add-size-stock]")?.addEventListener("click", addAdminSizeStock);

  adminForm.elements.sizeName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addAdminSizeStock();
    }
  });

  adminForm.elements.sizeStock?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addAdminSizeStock();
    }
  });

  adminSizeStocks?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-size-stock]");

    if (removeButton) {
      removeAdminSizeStock(removeButton.dataset.removeSizeStock);
    }
  });

  renderAdminSizeStocks();

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isAdminUser(currentUser)) {
      setAdminMessage("Bu işlem için admin hesabıyla giriş yapmalısın.", true);
      return;
    }

    const formData = new FormData(adminForm);
    const name = formData.get("name").trim();
    const description = formData.get("description").trim();
    const price = Number(formData.get("price"));
    const targetCategory = pageCategory || formData.get("category");
    const sizes = adminSizeRows.map((item) => item.size);
    const sizeStocks = getSizeStocksFromForm();
    const hasInvalidSizeStock = Object.values(sizeStocks).some((stock) => !Number.isFinite(stock) || stock < 0);
    const stock = Object.values(sizeStocks).reduce((total, sizeStock) => total + sizeStock, 0);
    const existingProduct = currentEditId ? currentProducts.find((item) => item.id === currentEditId) : null;
    const tone = existingProduct?.tone || "hoodie";
    const imageFiles = [...adminForm.elements.images.files];

    if (!targetCategory || !name || !description || !price || price < 1 || sizes.length === 0 || hasInvalidSizeStock) {
      setAdminMessage("Ürün adı, fiyat, beden stokları ve açıklama alanlarını kontrol et.", true);
      return;
    }

    if (!currentEditId && imageFiles.length === 0) {
      setAdminMessage("En az bir ürün görseli seçmelisin.", true);
      return;
    }

    if (imageFiles.length > 8) {
      setAdminMessage("Bir ürüne en fazla 8 görsel ekleyebilirsin.", true);
      return;
    }

    if (imageFiles.some((file) => !file.type.startsWith("image/"))) {
      setAdminMessage("Sadece görsel dosyaları yükleyebilirsin.", true);
      return;
    }

    const submitButton = adminForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setAdminMessage("Görseller hazırlanıyor...");

    try {
      const isEditing = Boolean(currentEditId);
      const productSlug = slugify(name);
      const imageUrls = imageFiles.length > 0
        ? await prepareProductImages(imageFiles, setAdminMessage)
        : existingAdminImages;

      setAdminMessage(isEditing ? "Ürün güncelleniyor..." : "Ürün yayınlanıyor...");

      const productData = {
        name,
        description,
        price,
        stock,
        sizeStocks,
        sizes,
        tone,
        imageUrls,
        images: imageUrls,
        imageStorage: "firestore-base64",
        category: targetCategory,
        active: true,
        slug: productSlug,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email
      };

      if (isEditing) {
        await updateDoc(doc(db, "products", currentEditId), productData);
      } else {
        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: serverTimestamp(),
          createdBy: currentUser.email
        });
      }

      adminForm.reset();
      currentEditId = null;
      existingAdminImages = [];
      clearAdminImagePreview();
      renderAdminSizeStocks();
      closeAdminForm();
      setAdminMessage(isEditing ? "Ürün güncellendi." : "Ürün yayınlandı.");
    } catch (error) {
      const message = error.code === "permission-denied"
          ? "Ürün eklenemedi: Firestore Rules içinde admin yazma iznini yayınla."
          : error.message || "Ürün eklenemedi. Firebase ayarlarını kontrol et.";
      setAdminMessage(message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
};

const setAuthMode = (mode) => {
  authMode = mode;
  const isRegister = mode === "register";

  authPanel.classList.toggle("auth-register", isRegister);
  authTitle.textContent = isRegister ? "Kayıt Ol" : "Giriş Yap";
  authSubmit.textContent = isRegister ? "Kayıt Ol" : "Giriş Yap";
  authPassword.autocomplete = isRegister ? "new-password" : "current-password";
  authName.required = isRegister;
  setMessage("");

  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authMode === mode);
  });
};

const openAuth = () => {
  document.body.classList.add("auth-open");
  authModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => authEmail.focus(), 50);
};

const closeAuth = () => {
  document.body.classList.remove("auth-open");
  authModal.setAttribute("aria-hidden", "true");
};

document.querySelectorAll("[data-close-auth]").forEach((button) => {
  button.addEventListener("click", closeAuth);
});

accountButton?.addEventListener("click", () => {
  closeSideMenu();
  openAuth();
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  setMessage(authMode === "register" ? "Hesap oluşturuluyor..." : "Giriş yapılıyor...");

  try {
    if (authMode === "register") {
      const credential = await createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value);
      if (authName.value.trim()) {
        await updateProfile(credential.user, { displayName: authName.value.trim() });
      }
      setMessage("Hesap oluşturuldu. Hoş geldin.");
    } else {
      await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value);
      setMessage("Giriş başarılı.");
    }

    authForm.reset();
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "Bu e-posta zaten kayıtlı.",
      "auth/invalid-email": "E-posta adresini kontrol et.",
      "auth/invalid-credential": "E-posta veya şifre hatalı.",
      "auth/operation-not-allowed": "Firebase'de Email/Password girişini aktif et.",
      "auth/unauthorized-domain": "Firebase Auth authorized domains listesine domaini ekle.",
      "auth/weak-password": "Şifre en az 6 karakter olmalı."
    };
    setMessage(messages[error.code] || "İşlem tamamlanamadı. Firebase ayarlarını kontrol et.", true);
  } finally {
    authSubmit.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  await signOut(auth);
  setMessage("Çıkış yapıldı.");
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  cart = loadCart(user);
  renderCart();

  const isSignedIn = Boolean(user);
  const isAdmin = isAdminUser(user);

  authForm.hidden = isSignedIn;
  userPanel.hidden = !isSignedIn;
  accountButton.textContent = isAdmin ? "Admin" : user ? "Hesabım" : "Giriş";

  if (adminPanel) {
    adminPanel.hidden = !isAdmin;
    setAdminMessage(isAdmin ? "Admin yetkisi aktif. Bu sayfaya ürün ekleyebilirsin." : "");

    if (!isAdmin && adminForm) {
      closeAdminForm();
    }
  }

  if (adminLock) {
    adminLock.hidden = isAdmin;
  }

  adminOnlySections.forEach((section) => {
    section.hidden = !isAdmin;
  });

  loadAdminOrders();

  if (user) {
    userName.textContent = user.displayName || "Orvello Üyesi";
    userEmail.textContent = user.email;
  }

  if (currentProducts.length > 0) {
    renderFirestoreProducts(currentProducts);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAdminForm();
    closeAuth();
    closeCart();
    closeCheckout();
    closeSideMenu();
  }
});

renderCart();
setupAdminPanel();
loadFirestoreProducts();
