# Orvello Monte

Streetwear tarzında tek sayfalık vitrin sitesi.

## Dosyalar

- `index.html`: Sayfa yapısı
- `kadın.html`: Kadın ürün sayfası
- `erkek.html`: Erkek ürün sayfası
- `styles.css`: Responsive tasarım ve ürün görselleri
- `script.js`: Firebase Auth giriş/kayıt paneli, kalıcı sepet drawer'ı ve bülten formu
- `assets/hero-streetwear.png`: Hero/lookbook görseli

## Admin Ürün Ekleme

Admin hesabı: `orvellomonte@gmail.com`

Kadın ve erkek ürün sayfalarında bu hesapla giriş yapınca ürün ekleme butonu görünür. Butona basınca ürün adı, fiyat, özel beden adı, beden bazlı stok, açıklama ve birden fazla görsel yükleme alanı açılır. Admin istediği kadar özel beden ekleyebilir, mevcut ürünleri kart üzerindeki düğmelerle düzenleyebilir veya silebilir. Görseller yayınlamadan önce tarayıcıda `webp` olarak sıkıştırılır ve QUAORA örneğindeki mantıkla direkt Firebase Firestore `products` koleksiyonundaki ürün dökümanına yazılır. Bu ürün yayınlama akışı Firebase Storage gerektirmez.

## Yayına Alma

Bu proje statik HTML/CSS/JS olduğu için GitHub Pages, Vercel veya Netlify ile doğrudan yayınlanabilir.
