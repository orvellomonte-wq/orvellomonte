(() => {
  try {
    document.documentElement.dataset.theme = localStorage.getItem("orvello-theme") === "dark"
      ? "dark"
      : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
