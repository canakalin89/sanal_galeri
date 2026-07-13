# Sanal Sergi — Aziz Sancar Anadolu Lisesi

Aziz Sancar Anadolu Lisesi öğrencilerinin resim ve sanat eserlerinin **dijital
arşiv** olarak saklandığı ve online sergilendiği web uygulaması. Eserler
taranıp bir Google Drive klasörüne yüklenir; site bu klasörden görselleri
**canlı** olarak çeker — yeni bir görsel eklediğinizde siteyi yeniden
yayınlamanıza (deploy) gerek kalmadan otomatik olarak görünür.

## Nasıl Çalışır?

1. **Drive'da bir klasör oluşturun**, eserlerin taranmış görsellerini bu
   klasöre yükleyin.
2. Klasörü **"Bağlantısı olan herkes görüntüleyebilir"** olarak paylaşın.
3. `/admin` panelinden şifreyle giriş yapıp **"+ Yeni Sergi"** ile klasör
   linkini yapıştırın, sergiye bir ad verin.
4. Site artık bu sergiyi otomatik gösterir. Klasöre yeni görsel eklediğinizde
   veya sildiğinizde site bir sonraki ziyarette bunu otomatik yansıtır —
   ekstra bir işlem gerekmez.
5. İsterseniz her eser için başlık, kısa açıklama ve öğrenci/öğretmen adı da
   admin panelinden eklenebilir.

## Yönetim Paneline Giriş

- Adres: **`https://siteniz.vercel.app/admin`**
- Şifre: Vercel projenizin ortam değişkenlerinde tanımlı **`ADMIN_PASSWORD`**
  değeridir.
- Giriş bilgisi unutulursa: Vercel Dashboard → proje → Settings →
  Environment Variables → `ADMIN_PASSWORD`.

## Özellikler

- **Canlı Drive entegrasyonu** — Görseller GitHub'a değil, doğrudan Google
  Drive'a yüklenir; site klasörü canlı okur.
- **Kurumsal tasarım** — Okul logosu ve renklerinden (lacivert / camgöbeği)
  türetilmiş özel tasarım sistemi.
- **Masonry Grid** — Eserlerin orijinal boyut oranlarını koruyan dinamik grid.
- **Lightbox** — Tam ekran görüntüleme, başlık/açıklama/sanatçı bilgisi,
  klavye ve dokunmatik (swipe) navigasyon.
- **Mobil uyumlu** — Telefon ve bilgisayardan rahat görüntüleme.
- **3D Sanal Sergi Salonu** — Sergi sayfasındaki "🏛 3D Salonda Gez" butonuyla,
  eserlerin altın çerçeveler içinde asılı olduğu procedural bir müze salonunda
  serbestçe gezinilebilir (PC'de WASD/fare, mobilde joystick/dokunmatik).
  Bir esere tıklanınca kamera önüne yaklaşır ve bilgi kartı açılır. Bu mod
  yalnızca butona basılınca yüklenir, normal galeri deneyimini yavaşlatmaz.
- **Yönetim Paneli** — Şifre korumalı; sergi oluşturma, düzenleme, kaldırma.
- **Gömme (iframe) desteği** — Herhangi bir sergiyi başka bir web sitesine
  gömmek için hazır kod üretici.
- **Galeri Müziği** — WQXR klasik müzik radyosu entegrasyonu.

## Teknolojiler

- Vanilla HTML / CSS / JavaScript (framework bağımsız)
- Vercel (hosting & serverless functions)
- Google Drive API (görsel kaynağı)
- GitHub API (sergi metadata'sının saklanması — `exhibitions.json`)

## Kurulum

### Vercel Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `ADMIN_PASSWORD` | Yönetim paneli şifresi |
| `GITHUB_TOKEN` | GitHub Personal Access Token (repo yazma izni ile) |
| `GITHUB_OWNER` | GitHub kullanıcı adı |
| `GITHUB_REPO` | Repository adı |
| `GITHUB_BRANCH` | Branch adı (varsayılan: `main`) |
| `GOOGLE_API_KEY` | Google Drive API anahtarı (Drive klasörlerini okumak için) |

### Google Drive API Anahtarı Alma

1. [Google Cloud Console](https://console.cloud.google.com)'da bir proje
   oluşturun (veya var olanı kullanın).
2. **APIs & Services → Library**'den **Google Drive API**'yi etkinleştirin.
3. **APIs & Services → Credentials → Create Credentials → API Key** ile bir
   anahtar oluşturun.
4. Bu anahtarı Vercel'de `GOOGLE_API_KEY` olarak ekleyin.

### Yerel Geliştirme

```bash
npm install
npm run build     # config.json'dan okul adını images-list.js'e yazar
npx serve .
```

> Not: `/api/*` klasöründeki serverless fonksiyonlar (Drive okuma, giriş)
> yalnızca Vercel üzerinde (veya `vercel dev` ile) çalışır; `serve` ile
> yalnızca statik arayüzü test edebilirsiniz.

## Yapı

```
sanal_galeri/
├── index.html          # Ana sayfa
├── style.css            # Ana sayfa stilleri (lacivert/camgöbeği tema)
├── script.js             # Galeri, lightbox, Drive'dan canlı veri çekme
├── exhibitions.json      # Sergi metadata'sı (ad, açıklama, Drive klasör ID)
├── images-list.js       # Build çıktısı — sadece okul adını taşır
├── build.js               # config.json → images-list.js
├── config.json            # Okul adı yapılandırması
├── assets/
│   ├── logo.png           # Okul logosu
│   ├── favicon-32.png
│   └── favicon-192.png
├── admin.html             # Yönetim paneli
├── admin.css              # Yönetim paneli stilleri
├── admin-app.js           # Yönetim paneli mantığı
├── gallery3d.js            # 3D sanal sergi salonu (yalnızca butonla lazy-load)
├── vendor/
│   └── three.module.js     # Three.js (yerel — CDN bağımlılığı yok)
├── vercel.json             # Vercel yapılandırması
└── api/
    ├── auth.js             # Kimlik doğrulama serverless function
    └── drive.js            # Google Drive API proxy (liste/indirme)
```

## Sergi Metadata Yapısı (`exhibitions.json`)

```json
[
  {
    "id": "hat-sergisi",
    "name": "Hat Sergisi",
    "description": "2025-2026 öğretim yılı hat sanatı sergisi.",
    "year": "2025-2026",
    "class": "9-A",
    "driveFolderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    "images": {
      "<drive-dosya-id>": {
        "title": "Besmele",
        "caption": "Sülüs hatla yazılmıştır.",
        "artist": "Ayşe Yılmaz"
      }
    }
  }
]
```

Bu dosya `/admin` panelinden otomatik güncellenir; elle düzenlemeniz
gerekmez.

## Gömme (Embed)

Admin panelindeki **"Göm"** butonu, bir sergiyi (veya tüm ana sayfayı)
başka bir web sitesine `<iframe>` ile gömmek için hazır kod üretir:

```html
<iframe src="https://siteniz.vercel.app/?embed=1#hat-sergisi" width="100%" height="600px" frameborder="0"></iframe>
```

> Not: 3D salon modunda fare kilidi (pointer lock) kullanılır. Gömülü
> (iframe) kullanımda bunun düzgün çalışması için iframe etiketine
> `allow="fullscreen; pointer-lock"` eklenmesi önerilir.

## Lisans

Bu proje Aziz Sancar Anadolu Lisesi için geliştirilmiştir.

Tasarım & Geliştirme: [Can Akalın](https://www.instagram.com/can_akalin)
