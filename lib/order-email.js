const INSTAGRAM_URL = "https://www.instagram.com/orvellomonte/";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const buildPaidOrderEmail = (merchantOid, order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const customerName = String(order.customer?.fullName || "Müşterimiz").trim();
  const itemRows = items.map((item) => {
    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    const lineTotal = Number(item.price || 0) * quantity;
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #dedbd4;color:#111;font-weight:700">${escapeHtml(item.name)}</td>
        <td style="padding:14px 8px;border-bottom:1px solid #dedbd4;color:#555;text-align:center">${escapeHtml(item.size || "Standart")} / ${quantity} adet</td>
        <td style="padding:14px 0;border-bottom:1px solid #dedbd4;color:#111;text-align:right;white-space:nowrap">${formatMoney(lineTotal)}</td>
      </tr>`;
  }).join("");
  const textItems = items.map((item) =>
    `- ${item.name} | ${item.size || "Standart"} | ${item.quantity || 1} adet | ${formatMoney(Number(item.price || 0) * Number(item.quantity || 1))}`
  ).join("\n");
  const discountLine = order.discount?.amount
    ? `<tr><td style="padding:5px 0;color:#555">İndirim (${escapeHtml(order.discount.code || "Kod")})</td><td style="padding:5px 0;text-align:right;color:#a52b1d">-${formatMoney(order.discount.amount)}</td></tr>`
    : "";

  const subject = `Siparişiniz alındı - ${merchantOid}`;
  const text = [
    `Merhaba ${customerName},`,
    "",
    "Ödemeniz onaylandı ve satın alma işleminiz tarafımıza ulaştı.",
    `Sipariş numaranız: ${merchantOid}`,
    "",
    textItems,
    "",
    `Ara toplam: ${formatMoney(order.subtotal)}`,
    order.discount?.amount ? `İndirim: -${formatMoney(order.discount.amount)}` : "",
    `Kargo: ${Number(order.shipping?.amount || 0) === 0 ? "Ücretsiz" : formatMoney(order.shipping.amount)}`,
    `Toplam: ${formatMoney(order.total)}`,
    "",
    "PDF sipariş ve ödeme özetiniz bu e-postaya eklenmiştir. Bu belge resmi e-Arşiv faturası yerine geçmez; resmi faturanız aynı e-posta adresine ayrıca gönderilecektir.",
    "Değişim için Instagram üzerinden @orvellomonte hesabımıza ulaşabilirsiniz:",
    INSTAGRAM_URL,
    "",
    "Orvello Monte"
  ].filter(Boolean).join("\n");
  const html = `<!doctype html>
  <html lang="tr">
  <body style="margin:0;background:#ecebe7;font-family:Arial,sans-serif;color:#111">
    <div style="max-width:680px;margin:0 auto;padding:28px 14px">
      <div style="background:#111;color:#fff;padding:20px 24px;font-size:24px;font-weight:900;letter-spacing:2px">ORVELLO MONTE</div>
      <div style="background:#fff;padding:30px 24px">
        <p style="margin:0 0 8px;color:#a52b1d;font-size:12px;font-weight:800;letter-spacing:1.5px">ÖDEME ONAYLANDI</p>
        <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">Siparişiniz bize ulaştı.</h1>
        <p style="margin:0 0 22px;color:#555;line-height:1.65">Merhaba ${escapeHtml(customerName)}, ödemeniz başarıyla onaylandı. Siparişinizi hazırlamaya başlıyoruz.</p>
        <div style="padding:16px;background:#f2f1ed;border-left:4px solid #a52b1d">
          <span style="display:block;color:#666;font-size:11px;letter-spacing:1px">SİPARİŞ NUMARASI</span>
          <strong style="display:block;margin-top:5px;font-size:16px">${escapeHtml(merchantOid)}</strong>
        </div>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;font-size:14px"><tbody>${itemRows}</tbody></table>
        <table role="presentation" style="width:100%;margin-top:18px;border-collapse:collapse;font-size:14px">
          <tbody>
            <tr><td style="padding:5px 0;color:#555">Ara toplam</td><td style="padding:5px 0;text-align:right">${formatMoney(order.subtotal)}</td></tr>
            ${discountLine}
            <tr><td style="padding:5px 0;color:#555">Kargo</td><td style="padding:5px 0;text-align:right">${Number(order.shipping?.amount || 0) === 0 ? "Ücretsiz" : formatMoney(order.shipping.amount)}</td></tr>
            <tr><td style="padding:14px 0 0;font-size:17px;font-weight:900">Toplam</td><td style="padding:14px 0 0;text-align:right;font-size:17px;font-weight:900">${formatMoney(order.total)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top:26px;padding-top:22px;border-top:1px solid #dedbd4;color:#555;font-size:13px;line-height:1.65">
          <strong style="color:#111">Fatura bilgilendirmesi</strong><br>
          PDF sipariş ve ödeme özetiniz bu e-postaya eklenmiştir. Bu belge resmi e-Arşiv faturası yerine geçmez; resmi e-Arşiv faturası aynı e-posta adresine ayrıca gönderilecektir.
        </div>
        <div style="margin-top:18px;padding:18px;background:#111;color:#fff;font-size:13px;line-height:1.6">
          Değişim için Instagram üzerinden bize ulaşabilirsiniz.<br>
          <a href="${INSTAGRAM_URL}" style="display:inline-block;margin-top:10px;color:#fff;font-weight:800">@orvellomonte</a>
        </div>
      </div>
    </div>
  </body>
  </html>`;

  return { subject, text, html };
};

module.exports = { buildPaidOrderEmail };
