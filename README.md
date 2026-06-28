# Sanal Sergi — Aziz Sancar Anadolu Lisesi

Aziz Sancar Anadolu Lisesi ogrencilerinin resim ve sanat eserlerinin sergilendigi online sanal galeri uygulamasi.

## Ozellikler

- **Sergi Yonetimi** — Birden fazla sergiyi ayri ayri organize etme
- **Masonry Grid** — Eserlerin orijinal boyut oranlarini koruyan dinamik grid gorunumu
- **Lightbox** — Eserleri tam ekran goruntuleme, klavye ve dokunmatik navigasyon
- **Yonetim Paneli** — Sifre korumalı admin paneli ile sergi olusturma, duzenleme ve silme
- **Responsive Tasarim** — Mobil, tablet ve masaustu cihazlara uyumlu
- **Galeri Muzigi** — WQXR klasik muzik radyosu entegrasyonu
- **SEO** — Meta etiketleri, Open Graph destegi

## Teknolojiler

- Vanilla HTML / CSS / JavaScript (framework bagimsiz)
- Vercel (hosting & serverless functions)
- GitHub API (icerik yonetimi)

## Kurulum

### Yerel Gelistirme

```bash
# Bagimliliklari yukle
npm install

# Sergi listesini olustur
npm run build

# Yerel sunucu baslat
npx serve .
```

### Vercel Deployment

Asagidaki ortam degiskenlerini Vercel projesinde tanimlayın:

| Degisken | Aciklama |
|---|---|
| `ADMIN_PASSWORD` | Yonetim paneli sifresi |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_OWNER` | GitHub kullanici adi |
| `GITHUB_REPO` | Repository adi |
| `GITHUB_BRANCH` | Branch adi (varsayilan: `main`) |

## Yapi

```
sanal_galeri/
├── index.html          # Ana sayfa
├── style.css           # Ana sayfa stilleri
├── script.js           # Galeri, lightbox, routing
├── images-list.js      # Build ciktisi (otomatik olusturulur)
├── build.js            # Sergi listesi olusturucu
├── config.json         # Okul adi yapilandirmasi
├── admin.html          # Yonetim paneli
├── admin.css           # Yonetim paneli stilleri
├── admin-app.js        # Yonetim paneli mantigi
├── vercel.json         # Vercel yapilandirmasi
├── api/
│   └── auth.js         # Kimlik dogrulama serverless function
└── images/
    └── <sergi-adi>/
        ├── meta.json   # Sergi bilgileri
        └── *.jpeg      # Eser gorselleri
```

## Sergi Ekleme

### Yonetim Paneli ile
1. `/admin` adresine gidin
2. Sifre ile giris yapin
3. "Yeni Sergi" butonuna tiklayin
4. Sergi adini girin ve resimleri yukleyin

### Manuel Olarak
1. `images/` altinda yeni bir klasor olusturun
2. Gorselleri klasore ekleyin
3. Istege bagli olarak `meta.json` ekleyin:
```json
{
  "name": "Sergi Adi",
  "description": "Sergi aciklamasi",
  "year": "2024-2025",
  "class": "9-A",
  "artists": {
    "resim (1).jpeg": "Ogrenci Adi"
  }
}
```
4. `npm run build` calistirin

## Lisans

Bu proje Aziz Sancar Anadolu Lisesi icin gelistirilmistir.

Tasarim & Gelistirme: [Can Akalin](https://www.instagram.com/can_akalin)
