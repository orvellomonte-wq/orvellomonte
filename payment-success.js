(() => {
  const params = new URLSearchParams(window.location.search);
  const merchantOid = params.get("merchant_oid") || "";
  const statusToken = params.get("status_token") || "";
  const root = document.querySelector("[data-payment-result]");
  const title = document.querySelector("[data-payment-title]");
  const kicker = document.querySelector("[data-payment-kicker]");
  const message = document.querySelector("[data-payment-message]");
  const icon = document.querySelector("[data-payment-icon]");
  const meta = document.querySelector("[data-order-meta]");
  const orderNumber = document.querySelector("[data-order-number]");
  const orderEmail = document.querySelector("[data-order-email]");
  const orderTotal = document.querySelector("[data-order-total]");
  const paidStep = document.querySelector('[data-payment-step="paid"]');
  const preparingStep = document.querySelector('[data-payment-step="preparing"]');
  const emailStep = document.querySelector('[data-payment-step="email"]');
  let attempts = 0;
  let paidConfirmed = false;

  const formatMoney = (value) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value || 0));

  const clearCart = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("orvello-cart"))
      .forEach((key) => localStorage.removeItem(key));
  };

  const renderOrderMeta = (order) => {
    meta.hidden = false;
    orderNumber.textContent = order.merchantOid;
    orderEmail.textContent = order.email || "E-posta adresiniz";
    orderTotal.textContent = formatMoney(order.total);
  };

  const renderPaid = (order) => {
    paidConfirmed = true;
    clearCart();
    root.classList.add("is-success");
    root.classList.remove("is-error");
    icon.classList.add("is-success");
    kicker.textContent = "ÖDEME ONAYLANDI";
    title.textContent = `${order.customerName ? `${order.customerName}, s` : "S"}iparişiniz bize ulaştı.`;
    message.textContent = order.emailStatus === "sent"
      ? `Sipariş ve ödeme özetinizi ${order.email} adresine gönderdik. Resmî e-Arşiv faturanız da aynı adrese iletilecek.`
      : `Siparişiniz hazırlık listemize alındı. Sipariş ve ödeme özetiniz ${order.email} adresine gönderiliyor; resmî e-Arşiv faturanız da aynı adrese iletilecek.`;
    paidStep.classList.add("complete");
    preparingStep.classList.add("active");
    emailStep.classList.toggle("complete", order.emailStatus === "sent");
    emailStep.classList.toggle("active", order.emailStatus !== "sent");
    renderOrderMeta(order);
  };

  const renderFailed = (order) => {
    root.classList.add("is-error");
    root.classList.remove("is-success");
    icon.classList.add("is-error");
    kicker.textContent = "ÖDEME ONAYLANAMADI";
    title.textContent = "Siparişinizi tamamlayamadık.";
    message.textContent = order.status === "amount_mismatch"
      ? "Ödeme tutarı sipariş tutarıyla eşleşmedi. Lütfen bizimle iletişime geçin."
      : "PayTR ödeme işlemini onaylamadı. Kartınızdan tahsilat gördüyseniz sipariş numaranızla bize ulaşın.";
    renderOrderMeta(order);
  };

  const renderUnavailable = () => {
    root.classList.add("is-error");
    icon.classList.add("is-error");
    kicker.textContent = "SİPARİŞ BİLGİSİ BULUNAMADI";
    title.textContent = "Ödeme durumunu doğrulayamadık.";
    message.textContent = "Bu sayfayı ödeme ekranından açtıysanız birkaç dakika sonra yeniden deneyin veya Instagram üzerinden bize ulaşın.";
  };

  const fetchStatus = async () => {
    attempts += 1;

    try {
      const response = await fetch(`/api/order-status?merchant_oid=${encodeURIComponent(merchantOid)}&status_token=${encodeURIComponent(statusToken)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const order = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(order.error || "Siparis durumu alinamadi.");
      }

      if (order.status === "paid") {
        renderPaid(order);
        if (order.emailStatus === "sent" || attempts >= 20) return;
      } else if (["failed", "amount_mismatch", "token_failed"].includes(order.status)) {
        renderFailed(order);
        return;
      } else if (attempts >= 20) {
        kicker.textContent = "ÖDEME ONAYI BEKLENİYOR";
        title.textContent = "İşleminiz PayTR tarafından doğrulanıyor.";
        message.textContent = "Ödeme yaptıysanız sayfayı kapatabilirsiniz. Onay geldiğinde siparişiniz sisteme düşecek ve e-posta bilgilendirmeniz gönderilecek.";
        renderOrderMeta(order);
        return;
      }
    } catch (error) {
      if (attempts >= 5 && !paidConfirmed) {
        renderUnavailable();
        return;
      }
    }

    window.setTimeout(fetchStatus, paidConfirmed ? 2000 : 1500);
  };

  if (!merchantOid || !statusToken) {
    renderUnavailable();
    return;
  }

  fetchStatus();
})();
