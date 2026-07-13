(() => {
  try {
    document.documentElement.dataset.theme = localStorage.getItem("orvello-theme") === "light"
      ? "light"
      : "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
