# Orvello Monte

Streetwear tarzında tek sayfalık vitrin sitesi.

## Dosyalar

- `index.html`: Sayfa yapısı
- `kadın.html`: Kadın ürün sayfası
- `erkek.html`: Erkek ürün sayfası
- `admin.html`: Ürün ve sipariş yönetimi
- `siparisler.html`: Admin sipariş paketleri
- `styles.css`: Responsive tasarım ve ürün görselleri
- `script.js`: Firebase Auth giriş/kayıt paneli, kalıcı sepet drawer'ı ve bülten formu
- `assets/hero-streetwear.png`: Hero/lookbook görseli

## Admin Ürün Ekleme

Admin hesabı: `orvellomonte@gmail.com`

Side paneldeki Admin linki sadece bu hesapla giriş yapınca görünür. `admin.html` sayfasında ürün ekleme butonu açılır. Butona basınca ürünün kadın veya erkek sayfasında yayınlanacağı seçilir; ürün adı, fiyat, özel beden adı, beden bazlı stok, açıklama ve birden fazla görsel yükleme alanı açılır. Admin istediği kadar özel beden ekleyebilir, mevcut ürünleri admin sayfasındaki ürün kartları üzerinden düzenleyebilir veya silebilir. Görseller yayınlamadan önce tarayıcıda `webp` olarak sıkıştırılır ve QUAORA örneğindeki mantıkla direkt Firebase Firestore `products` koleksiyonundaki ürün dökümanına yazılır. Bu ürün yayınlama akışı Firebase Storage gerektirmez.

## Siparişler

Sepetteki `Ödemeye Geç` butonu satın alma formunu açar. Müşteri ad soyad, telefon ve adres bilgisini girince sipariş `orders` koleksiyonuna yazılır, sepet temizlenir. Admin hesabıyla `admin.html` sayfasında giriş yapıldığında `Siparişler` butonu görünür; bu buton `siparisler.html` sayfasındaki sipariş paketlerine gider. Burada ürün adı, beden, görsel, adet, müşteri adı, telefon ve adres listelenir.

Admin panelindeki `İndirim Kodu` butonu `discounts` koleksiyonuna aktif/pasif indirim kodu yazar. Kullanıcı satın alma panelindeki indirim kodu alanına bu kodu girince sepet toplamına yüzde indirim uygulanır ve sipariş kaydına indirim kodu, indirim tutarı ve son toplam eklenir.

## Yayına Alma

Bu proje statik HTML/CSS/JS olduğu için GitHub Pages, Vercel veya Netlify ile doğrudan yayınlanabilir.
