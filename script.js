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
const pageCategory = document.body.dataset.category;
const productGrid = document.querySelector("[data-product-grid]");
const adminPanel = document.querySelector(".admin-product-panel");
const adminToggleButton = document.querySelector(".admin-toggle-button");
const adminForm = document.querySelector(".admin-product-form");
const adminMessage = document.querySelector(".admin-message");
const adminImagePreview = document.querySelector(".admin-image-preview");
const adminSizeStocks = document.querySelector(".admin-size-stocks");

let cart = JSON.parse(localStorage.getItem("orvello-cart") || "[]");
let authMode = "login";
let currentUser = null;
let adminPreviewUrls = [];
let currentProducts = [];
let currentEditId = null;
let existingAdminImages = [];

const formatPrice = (amount) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(amount);

const saveCart = () => {
  localStorage.setItem("orvello-cart", JSON.stringify(cart));
};

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
};

const openCart = () => {
  document.body.classList.add("cart-open");
  cartDrawer.setAttribute("aria-hidden", "false");
};

const closeCart = () => {
  document.body.classList.remove("cart-open");
  cartDrawer.setAttribute("aria-hidden", "true");
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

  if (productButton) {
    const productCard = productButton.closest(".product-card");
    const selectedSize = productCard?.querySelector("[data-size-select]")?.value || "Standart";
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

cartButton.addEventListener("click", openCart);

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
  checkoutButton.textContent = "Yakında";
  window.setTimeout(() => {
    checkoutButton.textContent = "Ödemeye Geç";
  }, 1400);
});

signupForm.addEventListener("submit", (event) => {
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

const getFormSizes = () => {
  if (!adminForm) {
    return [];
  }

  const checkedSizes = [...adminForm.querySelectorAll('input[name="sizes"]:checked')].map((input) => input.value);
  const customSizes = (adminForm.elements.customSizes?.value || "")
    .split(",")
    .map((size) => size.trim().toUpperCase())
    .filter(Boolean);

  return [...new Set([...checkedSizes, ...customSizes])];
};

const updateTotalStockInput = () => {
  if (!adminForm) {
    return 0;
  }

  const totalStock = [...adminForm.querySelectorAll("[data-size-stock]")].reduce((total, input) => {
    const stock = Number(input.value);
    return total + (Number.isFinite(stock) && stock > 0 ? stock : 0);
  }, 0);

  adminForm.elements.stock.value = String(totalStock);
  return totalStock;
};

const renderAdminSizeStocks = (seedStocks = {}) => {
  if (!adminSizeStocks || !adminForm) {
    return;
  }

  const previousStocks = [...adminForm.querySelectorAll("[data-size-stock]")].reduce((stocks, input) => {
    stocks[input.dataset.sizeStock] = input.value;
    return stocks;
  }, {});
  const sizes = getFormSizes();

  if (sizes.length === 0) {
    adminSizeStocks.innerHTML = `
      <div class="admin-size-stocks-empty">
        Beden seçince her beden için stok kutusu burada açılır.
      </div>
    `;
    updateTotalStockInput();
    return;
  }

  adminSizeStocks.innerHTML = `
    <div class="admin-size-stocks-title">Beden stokları</div>
    ${sizes.map((size) => {
      const stockValue = seedStocks[size] ?? previousStocks[size] ?? "";
      return `
        <label class="size-stock-field">
          <span>${escapeHtml(size)}</span>
          <input type="number" min="0" step="1" inputmode="numeric" data-size-stock="${escapeHtml(size)}" value="${escapeHtml(stockValue)}" placeholder="0">
        </label>
      `;
    }).join("")}
  `;
  updateTotalStockInput();
};

const getSizeStocksFromForm = () => {
  const sizeStocks = {};

  adminForm.querySelectorAll("[data-size-stock]").forEach((input) => {
    const size = input.dataset.sizeStock;
    const stock = Number(input.value);
    sizeStocks[size] = Number.isFinite(stock) && stock >= 0 ? stock : -1;
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
  currentEditId = null;
  existingAdminImages = [];
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
  const isAdmin = isAdminUser(currentUser);

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
        <select class="size-select" aria-label="${escapeHtml(product.name)} beden seçimi" data-size-select>
          ${sizes.map((size) => {
            const sizeStock = Number(sizeStocks[size] ?? stock);
            return `<option value="${escapeHtml(size)}" ${sizeStock <= 0 ? "disabled" : ""}>${escapeHtml(size)}${sizeStock <= 0 ? " - stok yok" : ""}</option>`;
          }).join("")}
        </select>
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
  if (!pageCategory || !productGrid) {
    return;
  }

  const productQuery = query(collection(db, "products"), where("category", "==", pageCategory));

  onSnapshot(
    productQuery,
    (snapshot) => {
      const products = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => product.active !== false)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      currentProducts = products;
      renderFirestoreProducts(products);
    },
    () => {
      setAdminMessage("Firestore ürünleri okunamadı. Firebase Rules ayarlarını kontrol et.", true);
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
  adminForm.elements.stock.value = product.stock || 0;
  adminForm.elements.description.value = product.description || "";
  adminForm.elements.tone.value = product.tone || "hoodie";

  const productSizes = product.sizes?.length ? product.sizes : Object.keys(product.sizeStocks || {});
  const checkboxValues = [...adminForm.querySelectorAll('input[name="sizes"]')].map((input) => input.value);
  const customSizes = [];

  adminForm.querySelectorAll('input[name="sizes"]').forEach((input) => {
    input.checked = productSizes.includes(input.value);
  });

  productSizes.forEach((size) => {
    if (!checkboxValues.includes(size)) {
      customSizes.push(size);
    }
  });

  adminForm.elements.customSizes.value = customSizes.join(", ");
  const editSizeStocks = product.sizeStocks || productSizes.reduce((stocks, size, index) => {
    stocks[size] = index === 0 ? Number(product.stock || 0) : 0;
    return stocks;
  }, {});

  renderAdminSizeStocks(editSizeStocks);
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
  if (!adminPanel || !adminForm || !pageCategory) {
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

  adminForm.querySelectorAll('input[name="sizes"]').forEach((input) => {
    input.addEventListener("change", () => renderAdminSizeStocks());
  });

  adminForm.elements.customSizes?.addEventListener("input", () => renderAdminSizeStocks());

  adminSizeStocks?.addEventListener("input", (event) => {
    if (event.target.matches("[data-size-stock]")) {
      updateTotalStockInput();
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
    const sizes = getFormSizes();
    const sizeStocks = getSizeStocksFromForm();
    const hasInvalidSizeStock = Object.values(sizeStocks).some((stock) => stock < 0);
    const stock = Object.values(sizeStocks).reduce((total, sizeStock) => total + sizeStock, 0);
    const tone = formData.get("tone");
    const imageFiles = [...adminForm.elements.images.files];

    if (!name || !description || !price || price < 1 || sizes.length === 0 || hasInvalidSizeStock) {
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
        category: pageCategory,
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

accountButton.addEventListener("click", openAuth);

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
  }
});

renderCart();
setupAdminPanel();
loadFirestoreProducts();
