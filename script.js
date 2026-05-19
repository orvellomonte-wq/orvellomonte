const cartCounter = document.querySelector(".cart-link span");
const addButtons = document.querySelectorAll("[data-product]");
const signupForm = document.querySelector(".signup-form");

let cartCount = 0;

addButtons.forEach((button) => {
  button.addEventListener("click", () => {
    cartCount += 1;
    cartCounter.textContent = cartCount;
    button.textContent = "Eklendi";
    window.setTimeout(() => {
      button.textContent = "Ekle";
    }, 1200);
  });
});

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = signupForm.querySelector("button");
  button.textContent = "Alındı";
  signupForm.reset();
});
