const toAscii = (value = "") => String(value)
  .replaceAll("Ç", "C").replaceAll("ç", "c")
  .replaceAll("Ğ", "G").replaceAll("ğ", "g")
  .replaceAll("İ", "I").replaceAll("ı", "i")
  .replaceAll("Ö", "O").replaceAll("ö", "o")
  .replaceAll("Ş", "S").replaceAll("ş", "s")
  .replaceAll("Ü", "U").replaceAll("ü", "u")
  .replace(/[^\x20-\x7E]/g, "");

const escapePdfText = (value) => toAscii(value)
  .replaceAll("\\", "\\\\")
  .replaceAll("(", "\\(")
  .replaceAll(")", "\\)");

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const buildPdf = (stream) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%ORVELLO\n", "ascii")];
  const offsets = [0];
  let length = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii");
    chunks.push(chunk);
    length += chunk.length;
  });

  const xrefOffset = length;
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "]
    .concat(offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `))
    .join("\n");
  chunks.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "ascii"));
  return Buffer.concat(chunks);
};

const buildPaidOrderReceiptPdf = (merchantOid, order) => {
  const lines = [];
  let y = 790;
  const addText = (text, options = {}) => {
    const font = options.bold ? "F2" : "F1";
    const size = options.size || 10;
    lines.push(`BT /${font} ${size} Tf 1 0 0 1 ${options.x || 50} ${y} Tm (${escapePdfText(text)}) Tj ET`);
    y -= options.gap || 18;
  };

  addText("ORVELLO MONTE", { bold: true, size: 24, gap: 34 });
  addText("ODEME ONAYLI SIPARIS VE ODEME OZETI", { bold: true, size: 14, gap: 25 });
  addText(`Siparis No: ${merchantOid}`, { bold: true });
  addText(`Musteri: ${order.customer?.fullName || "-"}`);
  addText(`E-posta: ${order.customer?.email || "-"}`);
  addText(`Duzenlenme: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`, { gap: 28 });

  addText("URUNLER", { bold: true, size: 12, gap: 22 });
  (Array.isArray(order.items) ? order.items : []).forEach((item) => {
    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    addText(`${item.name} | Beden: ${item.size || "Standart"} | ${quantity} adet | ${formatMoney(Number(item.price || 0) * quantity)}`, { size: 9 });
  });

  y -= 10;
  addText(`Ara toplam: ${formatMoney(order.subtotal)}`, { x: 330 });
  if (Number(order.campaign?.amount || 0) > 0) {
    addText(`2 Al 1 Hediye: -${formatMoney(order.campaign.amount)}`, { x: 330 });
  }
  if (Number(order.discount?.amount || 0) > 0) {
    addText(`Indirim: -${formatMoney(order.discount.amount)}`, { x: 330 });
  }
  addText(`Kargo: ${Number(order.shipping?.amount || 0) === 0 ? "Ucretsiz" : formatMoney(order.shipping.amount)}`, { x: 330 });
  addText(`TOPLAM: ${formatMoney(order.total)}`, { x: 330, bold: true, size: 13, gap: 34 });
  addText("Bu belge odeme onayli siparis ve odeme ozetidir.", { size: 8 });
  addText("Resmi e-Arsiv faturasi yerine gecmez; resmi fatura ayni e-posta adresine ayrica gonderilir.", { size: 8 });
  addText("Degisim: instagram.com/orvellomonte", { size: 8 });

  return buildPdf(lines.join("\n"));
};

module.exports = { buildPaidOrderReceiptPdf };
