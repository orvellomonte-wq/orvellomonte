# Orvello Monte

Streetwear tarzında tek sayfalık vitrin sitesi.

## Dosyalar

- `index.html`: Sayfa yapısı
- `kadın.html`: Kadın ürün sayfası
- `erkek.html`: Erkek ürün sayfası
- `aksesuar.html`: Aksesuar ürün sayfası
- `admin.html`: Ürün ve sipariş yönetimi
- `siparisler.html`: Admin sipariş paketleri
- `odeme.html`: PayTR iFrame ödeme sayfası
- `styles.css`: Responsive tasarım ve ürün görselleri
- `script.js`: Firebase Auth giriş/kayıt paneli, kalıcı sepet drawer'ı ve bülten formu
- `assets/hero-streetwear.png`: Hero/lookbook görseli

## Admin Ürün Ekleme

Admin hesabı: `orvellomonte@gmail.com`

Side paneldeki Admin linki sadece bu hesapla giriş yapınca görünür. `admin.html` sayfasında ürün ekleme butonu açılır. Butona basınca ürünün kadın, erkek veya aksesuar sayfasında yayınlanacağı seçilir; ürün adı, fiyat, özel beden adı, beden bazlı stok, açıklama ve birden fazla görsel yükleme alanı açılır. Admin istediği kadar özel beden ekleyebilir, mevcut ürünleri admin sayfasındaki ürün kartları üzerinden düzenleyebilir veya silebilir. Görseller yayınlamadan önce tarayıcıda `webp` olarak sıkıştırılır ve QUAORA örneğindeki mantıkla direkt Firebase Firestore `products` koleksiyonundaki ürün dökümanına yazılır. Bu ürün yayınlama akışı Firebase Storage gerektirmez.

## Siparişler

Sepetteki `Ödemeye Geç` butonu satın alma formunu açar. Müşteri ad soyad, telefon ve adres bilgisini girince `/api/paytr-token` Vercel Function üzerinden PayTR token alınır, sipariş `orders` koleksiyonuna `payment.status: pending` olarak yazılır ve müşteri mobil uyumlu `odeme.html` sayfasındaki PayTR iFrame ödeme ekranına yönlendirilir. PayTR `Bildirim URL` callback'i `/api/paytr-callback` adresine geldiğinde sipariş `paid` veya `failed` olarak güncellenir. Admin hesabıyla `admin.html` sayfasında giriş yapıldığında `Siparişler` butonu görünür; bu buton `siparisler.html` sayfasındaki sipariş paketlerine gider. Burada ürün adı, beden, görsel, adet, müşteri adı, telefon, adres ve ödeme durumu listelenir.

Admin panelindeki `İndirim Kodu` butonu `discounts` koleksiyonuna aktif/pasif indirim kodu yazar. Kullanıcı satın alma panelindeki indirim kodu alanına bu kodu girince sepet toplamına yüzde indirim uygulanır ve sipariş kaydına indirim kodu, indirim tutarı ve son toplam eklenir.

`politikalar.html` sayfası side panelden açılır. Teslimat, değişim, gizlilik ve mesafeli satış metinleri bu sayfada listelenir. Admin hesabıyla giriş yapıldığında her politika kartında düzenleme simgesi görünür; metinler aynı sayfada düzenlenip Firestore `site_content/policies` dökümanına kaydedilir.

`iletisim.html` sayfası Early Access e-posta kayıt formunu ve Instagram linkini içerir. Kayıtlar Firestore `newsletter_subscribers` koleksiyonuna yazılır; admin panelindeki e-posta mesaj alanı `/api/send-newsletter` Vercel Function üzerinden kayıtlı adreslere Brevo Transactional API ile mesaj gönderir. Vercel environment variables içinde `FIREBASE_SERVICE_ACCOUNT_JSON`, `BREVO_API_KEY` ve `SMTP_FROM` tanımlı olmalıdır. SMTP fallback için ayrıca `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` ve `SMTP_PASS` kullanılabilir.

## PayTR

PayTR iFrame API entegrasyonu server-side çalışır. Vercel Project Settings > Environment Variables alanına şunlar eklenmelidir:

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `PAYTR_TEST_MODE=1` test için, canlıda `0`
- `PAYTR_DEBUG_ON=1` test için, canlıda `0`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

PayTR panelinde Bildirim URL olarak `https://orvellomonte.com/api/paytr-callback` girilmelidir. Başarı ve hata sayfaları token isteğinde otomatik olarak `odeme-basarili.html` ve `odeme-hata.html` adreslerine ayarlanır.

## Yayına Alma

Bu proje statik HTML/CSS/JS olduğu için GitHub Pages, Vercel veya Netlify ile doğrudan yayınlanabilir.
