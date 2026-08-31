# Sanal Sergi — Aziz Sancar Anadolu Lisesi

Öğrenci eserlerini Google Drive'dan okuyarak sergileyen, HTML/CSS/JavaScript
ile geliştirilmiş dijital arşiv. Vercel üzerinde statik arayüz ve Node.js API
işlevleri birlikte çalışır. Normal galeriye ek olarak Three.js ile 3D salon bulunur.

## İçerik akışı

1. Görselleri bir Drive klasörüne yükleyin; klasörü bağlantıyla görüntülenebilir yapın.
2. /admin üzerinden oturum açın, Yeni Sergi ile klasör bağlantısını ekleyin.
3. Eserlere isteğe bağlı başlık, açıklama ve sanatçı bilgisi girin.
4. Kaydet, sergi bilgilerini GitHub'daki exhibitions.json dosyasına yazar.
5. Metadata değişikliği ancak Vercel yayını tamamlanınca ziyaretçiye görünür.
   Paneldeki kayıt bildirimi yayın başarısı anlamına gelmez.

Drive'a görsel eklemek veya kaldırmak yeniden yayınlama gerektirmez.
Ziyaretçi liste yanıtı en fazla 60 saniye CDN önbelleğinde tutulur.
Tarayıcı başarılı eser listesini 60 saniye saklar; aynı klasöre eşzamanlı
istekler tek çağrıyı paylaşır. Süre dolunca sonraki açılışta yeniden okunur.
Galeri başlığındaki ↻ düğmesi tarayıcıdaki listeyi beklemeden yeniden ister;
CDN önbelleği nedeniyle en son Drive değişikliği hemen görünmeyebilir.
Bu düğme yalnızca eser listesini yeniler; yayımlanan sergi adı/açıklaması
değiştiyse sayfayı yenileyin. Yeni sergi klasörünün erişimi yeni yayınla açılır.

Sergiyi kaldırmak yalnızca site bağlantısını kaldırır, Drive dosyalarını silmez.
Drive'da görünmeyen eserlerin önceden kaydedilmiş açıklamaları korunur.
Eserin görünür alanlarını bilerek boşaltıp kaydetmek o eserin açıklamalarını kaldırır.

## Yönetim güvenliği

- GitHub token'ı yalnızca sunucuda kalır. Tarayıcı GitHub API'ye doğrudan bağlanmaz.
- Bir saatlik imzalı oturum, üretimde Secure + HttpOnly + SameSite=Strict
  ve __Host- önekli çerezde taşınır. JavaScript yalnızca CSRF değerini alır.
- Yazma ve çıkış isteklerinde izinli Origin ve oturuma bağlı CSRF kontrol edilir.
- Çıkış çerezi siler; önceden ele geçirilmiş bir çerez süre sonuna kadar
  geçerli kalabilir. ADMIN_PASSWORD veya SESSION_SECRET değişikliği tüm
  önceki oturumları geçersiz kılar.
- Girişler Vercel Firewall SDK ile sınırlandırılır. Kural veya servis eksikse
  giriş 503 ile kapanır; sınırsız girişe geri dönüş yapılmaz.
- API yalnızca exhibitions.json ve config.json dosyalarını okuyup yazabilir.
- Kayıt, editörün okuduğu SHA ile yapılır. Çakışmada 409 döner; otomatik
  yeniden deneme veya başka oturumun değişikliklerini ezme yapılmaz.
- Okuma hatası boş listeye çevrilmez. Drive yüklenmeden Kaydet kapalıdır.
- Ziyaretçi Drive API'si yalnızca yayındaki katalog klasörlerini listeler.
  Yeni klasörü denetleyen /api/admin-drive oturum gerektirir.
- Kullanılmayan anonim base64 dosya indirme uç noktası kaldırılmıştır.
- Yayın paketi dist/ içindeki izinli dosyalardan oluşur; server/, testler,
  .env ve proje yapılandırma dosyaları statik yayıma alınmaz.
- Yönetim arayüzü iframe içine alınamaz ve kendisine özel CSP kullanır.
  Ziyaretçi galerisinin iframe desteği korunur.

## Ortam değişkenleri

Gerçek değerleri yalnızca Vercel'in ilgili ortamına veya git dışındaki
.env.local dosyasına yazın. .env.example yalnızca bir şablondur.

| Değişken | İşlev |
|---|---|
| ADMIN_PASSWORD | Güçlü yönetici şifresi |
| SESSION_SECRET | En az 32 bayt rastgele, şifreden ayrı imzalama sırrı |
| APP_ORIGIN | Yönetim arayüzünün kesin kaynağı, ör. https://asalgaleri.vercel.app |
| GITHUB_TOKEN | Yalnızca ilgili depoda Contents read/write yetkili token |
| GITHUB_OWNER | Depo sahibi |
| GITHUB_REPO | Depo adı |
| GITHUB_BRANCH | İçeriğin okunup yazıldığı dal; varsayılan main |
| GOOGLE_API_KEY | Drive okuma anahtarı; yalnızca Drive API'ye kısıtlayın |

Üretim Vercel işlevlerinde NODE_ENV=production ve sistem değişkenlerinin
(VERCEL, VERCEL_URL) erişilebilir olması gerekir.
Güvenilir VERCEL_URL, geçerli dağıtımın yönetim kaynağı olarak da kabul edilir.
APP_ORIGIN'e bir joker alan adı veya kullanıcıdan gelen Host değeri yazmayın.

### Giriş hız sınırı — yayın öncesi zorunlu

Vercel Firewall'da bir SDK kuralı oluşturun:
- Koşul: @vercel/firewall
- Rate limit ID: gallery-admin-login
- Sınır: IP başına 15 dakikada 5 istek
- Eylem: rate limit

Kuralın ilgili üretim/önizleme adresinde etkin olduğunu doğrulayın.
Önizleme koruması kullanılıyorsa SDK'nın resmi gerekliliklerini uygulayın;
gerekli otomasyon sırrını yalnızca sunucu ortamında tutun.
Bu depo kuralı otomatik oluşturmaz veya mevcut firewall ayarlarını değiştirmez.

[Resmi Vercel SDK belgesi](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
ve [GitHub dosya sürümü/SHA belgesi](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

Yerel development/test modunda yalnızca deneme amaçlı bellek içi
5 istek / 15 dakika sınırı vardır. Üretimde bunun kullanılması engellenir.

## Güvenli önizleme ve yayın sırası

1. Ayrı bir preview/ dalında kod ve kopya sergi verileri hazırlayın.
2. Önizleme ortamındaki GITHUB_BRANCH aynı preview/ dalını göstermeli.
   VERCEL_ENV=preview iken diğer dal adlarına yönetim erişimi kapalıdır.
3. Ayrı test Drive klasörü ve dar yetkili test token'ı kullanın.
4. SESSION_SECRET, APP_ORIGIN ve Firewall kuralını önizlemede tamamlayın.
5. Oturum, kayıt çakışması ve test içeriğinin yayına yansımasını doğrulayın.
6. Üretim ortamındaki Vercel Build Output Directory ayarını dist ile uyumlu tutun.
   GitHub otomatik yayın bağlantısını kontrol edin.
7. Onaylanan sürümü yayımlayın. Yeni paneli /admin adresinden yeniden açın.
8. Eski sürüm token'ı tarayıcıya gönderdiği için geçiş sırasında GitHub token'ını
   yenileyin; eski token'ı iptal edip panelden tekrar giriş yapın.

Token yenileme ve gerçek ortam değişkenleri bu geliştirme sırasında değiştirilmedi.
Eski sürüme geri dönüş token'ı yeniden tarayıcıya açar; güvenlik etkisini değerlendirmeden
eski kimlik doğrulama koduna dönmeyin. İçerik hataları GitHub geçmişindeki
ilgili JSON sürümünden kurtarılabilir; Drive dosyaları ayrı korunur.

## Yerel kontroller

Node.js 22 veya üzeri kullanın.

```sh
npm ci
npm test
npm run lint
npm run build
```

Testler Node.js'in yerleşik test aracıyla çalışır; gerçek GitHub/Drive
bağlantısı veya canlı veri yazımı yapmaz. Test verileri bellektedir.
lint, JavaScript sözdizimini denetler. build, katalog doğrulamasından sonra
yalnızca izinli statik dosyaları dist/ içine üretir.

Statik görünüm için dist/ sunulabilir. Oturum ve API işlevleri için vercel dev
gerekir; üretim sırları yerine test yapılandırması kullanın. Yerel izinli
kaynaklar http://localhost:4173 ve http://127.0.0.1:4173'tür.
Düz statik sunucuda yönetim API'si çalışmaz.

## Alan sınırları

Sunucu doğrulaması ve derlemede üretilen yönetim alan sınırları aynı
server/validation.js tanımından gelir:
- En fazla 200 sergi; sergi başına 2000 görsel.
- Sergi/okul adı ve eser başlığı: 160 karakter.
- Sergi açıklaması: 10000; eser açıklaması: 2000 karakter.
- Sanatçı: 160; öğretim yılı: 30; sınıf: 80 karakter.
- Yönetim isteği: en fazla 512 KiB JSON.
- GitHub ve Drive istekleri: 10 saniye zaman aşımı.

Limit veya davranış değiştiğinde ilgili doğrulama, panel ve bu açıklamaları
birlikte güncelleyin.

## Dosya haritası

- index.html / style.css / script.js: ziyaretçi galerisi ve büyük görsel penceresi
- gallery-data.js: ziyaretçi yanıt doğrulaması, ortak istekler ve kısa önbellek
- artwork-tools.js: Türkçe arama, sanatçı filtresi ve kalıcı eser bağlantıları
- gallery3d.js / vendor/: 3D salon, yerel Three.js ve modeller
- admin.html / admin-app.js / admin-state.js: yönetim arayüzü ve veri koruma
- api/auth.js: giriş, oturum sorgusu, çıkış
- api/admin.js: sınırlı GitHub dosya okuma/kaydetme
- api/drive.js: yayındaki sergilerin ziyaretçi listesi
- api/admin-drive.js: oturumlu yönetici için klasör denetleme
- server/: ortak oturum, hız sınırı, doğrulama ve servis katmanı
- exhibitions.json: sergi bilgileri; config.json: okul adı
- build.js: doğrulanmış statik yayın paketi
- tests/: kısa güvenlik ve veri koruma senaryoları

## Görünüm ve gömme

Lacivert/camgöbeği okul tasarımı, orijinal görsel oranlarını koruyan sütunlar,
klavye/dokunmatik büyük görsel gezinmesi ve WQXR radyo bileşeni bulunur.
3D mod yalnızca butonla yüklenir; WASD/fare veya mobil joystick ile gezinilir.
Fare kilidi desteklenmediğinde sürükleyerek bakılabilir. Mobilde yürüyüş ve
bakış farklı parmaklarla birlikte kullanılabilir; çubuk hareketi yürüyüş hızını ayarlar.
Salon yüklenirken de kapatılabilir. Kapanışta kontroller ve sahne kaynakları
temizlenir; geç tamamlanan yüklemeler kapatılan salona uygulanmaz. Model
çözücü, varsa devam eden işleri tamamlanınca serbest bırakılır.
Karşılama panosunun başlangıç genişliği ekranın görüş alanına göre sınırlandırılır.
3D salonda görünür esere tıklamak/dokunmak büyük görsel, başlık, açıklama,
sanatçı ve paylaşım bağlantısını açar. Fare kilitliyken ekran merkezindeki
işaret kullanılır. Eser seç listesinden İncele düğmesiyle de aynı pencere açılır.
Kart açıkken yürüyüş/bakış durur; ESC kartı kapatıp aynı salon konumuna döner.
Kamera esere otomatik yaklaşmaz.

Galerideki arama başlık, açıklama, sanatçı ve Drive dosya adını tarar; Türkçe
ve aksansız yazımlar desteklenir. Sanatçı filtresi aramayla birlikte çalışır.
Sonuç sayısı gösterilir; Filtreleri temizle bütün eserleri geri getirir.
3D salon ve büyük görselde önceki/sonraki gezinmesi seçili sonuçlarla sınırlıdır.

Eser bağlantıları #sergi-kimliği?eser=DRIVE_DOSYA_KIMLIGI biçimindedir;
eserin sırası değişse de aynı dosyayı açar. Bağlantıyla açılışta filtreler
temizlenir ve eser doğrudan gösterilir. Silinmiş/kaldırılmış dosya için uyarı
görünür. Dosya başka kimlikle yeniden yüklenirse veya sergi kimliği değiştirilirse
eski bağlantı artık o eseri açamaz.
Bağlantıyı kopyala düğmesi panoyu kullanır; izin yoksa seçilebilir adres sunar.
Paylaşım adresinden embed ve diğer sorgu parametreleri kaldırılır. Kartı
kapatmak adresi sergiye döndürür; kartlar arasında gezinme geçmişi şişirmez.

Görsel penceresinde yükleme/hata durumu ve Tekrar dene düğmesi bulunur.
Eser açıklamaları ayrı, kaydırılabilir alandadır; dikey kaydırma eser değiştirmez.
Tab odağı açık pencere içinde kalır ve kapanınca galeriye döner. ESC ile kapatma
ve sağ/sol oklarla eser değiştirme desteklenir.

Radyo mobilde ilk ziyarette kapalıdır; açılma tercihi hatırlanır. Oynatıcı yalnızca
ilk açılışta yüklenir. Daraltma müziği durdurmaz; durdurmak için oynatıcıdaki
duraklatma düğmesini kullanın. Gömme modunda oynatıcı yüklenmez.

```html
<iframe src="https://asalgaleri.vercel.app/?embed=1#hat-sergisi"
  width="100%" height="600" style="border:none"
  allow="fullscreen; pointer-lock" allowfullscreen></iframe>
```

Gömme modunda geri düğmesi, radyo ve altbilgi gizlenir.
Geçersiz sergi bağlantısında açıklama ve tüm sergilere dönüş düğmesi görünür.
Sergi/katalog yükleme hataları boş liste gibi gösterilmez; Tekrar dene ile
sayfa yenilemeden yeniden okunabilir. Ziyaretçi veri istekleri, yanıt gövdesi
dahil 15 saniyede zaman aşımına uğrar. Başarısız/bozuk yanıtlar önbelleğe alınmaz.
Ana sayfada kapak ve eser sayısı yalnızca ekran yakınına gelen kartlar için
istenir; gözlem API'si bulunmayan tarayıcılarda normal yükleme kullanılır.
Gömme ve 3D kontrolleri değişik tarayıcılarda ayrıca denenmelidir.

Tasarım ve geliştirme: Can Akalın — Aziz Sancar Anadolu Lisesi.
