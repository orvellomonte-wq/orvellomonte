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
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
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

let cart = JSON.parse(localStorage.getItem("orvello-cart") || "[]");
let authMode = "login";
let currentUser = null;

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
        <div class="cart-item-visual ${item.tone || getProductTone(item.id)}" aria-hidden="true"></div>
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

const addToCart = (product) => {
  const existingItem = cart.find((item) => item.id === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart();
  renderCart();
};

const updateQuantity = (id, action) => {
  cart = cart
    .map((item) => {
      if (item.id !== id) {
        return item;
      }

      const quantity = action === "increase" ? item.quantity + 1 : item.quantity - 1;
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

document.addEventListener("click", (event) => {
  const productButton = event.target.closest("[data-product]");
  const aboutButton = event.target.closest("[data-about-toggle]");

  if (aboutButton) {
    const aboutText = aboutButton.closest(".product-meta")?.querySelector(".product-about");

    if (aboutText) {
      aboutText.hidden = !aboutText.hidden;
      aboutButton.textContent = aboutText.hidden ? "Hakkında" : "Kapat";
    }
  }

  if (productButton) {
    const productCard = productButton.closest(".product-card");
    const selectedSize = productCard?.querySelector("[data-size-select]")?.value || "Standart";
    const baseId = productButton.dataset.id;
    const originalText = productButton.textContent;

    addToCart({
      id: `${baseId}-${selectedSize.toLowerCase()}`,
      name: productButton.dataset.product,
      price: Number(productButton.dataset.price),
      tone: productButton.dataset.tone || getProductTone(baseId),
      size: selectedSize
    });
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

const renderFirebaseProduct = (product) => `
  <article class="product-card" data-firestore-product="${escapeHtml(product.id)}">
    <div class="product-visual ${escapeHtml(product.tone)}"></div>
    <div class="product-info">
      <h3>${escapeHtml(product.name)}</h3>
      <div class="product-meta">
        <select class="size-select" aria-label="${escapeHtml(product.name)} beden seçimi" data-size-select>
          ${(product.sizes?.length ? product.sizes : ["S", "M", "L"]).map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join("")}
        </select>
        <button class="about-button" type="button" data-about-toggle>Hakkında</button>
        <p class="product-about" hidden>${escapeHtml(product.description)}</p>
      </div>
      <div class="product-row">
        <span>${formatPrice(product.price)}</span>
        <button type="button" data-product="${escapeHtml(product.name)}" data-id="${escapeHtml(product.id)}" data-price="${product.price}" data-tone="${escapeHtml(product.tone)}">Sepete Ekle</button>
      </div>
    </div>
  </article>
`;

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

      renderFirestoreProducts(products);
    },
    () => {
      setAdminMessage("Firestore ürünleri okunamadı. Firebase Rules ayarlarını kontrol et.", true);
    }
  );
};

const setupAdminPanel = () => {
  if (!adminPanel || !adminForm || !pageCategory) {
    return;
  }

  adminToggleButton?.addEventListener("click", () => {
    adminForm.hidden = !adminForm.hidden;
    adminToggleButton.textContent = adminForm.hidden ? "Ürün Ekle" : "Paneli Kapat";
    setAdminMessage("");
  });

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
    const sizes = formData
      .get("sizes")
      .split(",")
      .map((size) => size.trim().toUpperCase())
      .filter(Boolean);
    const tone = formData.get("tone");

    if (!name || !description || !price || price < 1 || sizes.length === 0) {
      setAdminMessage("Ürün adı, fiyat, beden ve açıklama alanlarını kontrol et.", true);
      return;
    }

    const submitButton = adminForm.querySelector("button");
    submitButton.disabled = true;
    setAdminMessage("Ürün yayınlanıyor...");

    try {
      await addDoc(collection(db, "products"), {
        name,
        description,
        price,
        sizes,
        tone,
        category: pageCategory,
        active: true,
        slug: slugify(name),
        createdAt: serverTimestamp(),
        createdBy: currentUser.email
      });

      adminForm.reset();
      setAdminMessage("Ürün yayınlandı.");
    } catch (error) {
      setAdminMessage("Ürün eklenemedi. Firestore izinlerini kontrol et.", true);
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
      adminForm.hidden = true;
      if (adminToggleButton) {
        adminToggleButton.textContent = "Ürün Ekle";
      }
    }
  }

  if (user) {
    userName.textContent = user.displayName || "Orvello Üyesi";
    userEmail.textContent = user.email;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAuth();
    closeCart();
  }
});

renderCart();
setupAdminPanel();
loadFirestoreProducts();
