# 3D modeller, harita ve hava kaynakları

Bu modeller yalnızca 3D salon açıldığında yerel dosyalardan yüklenir. Model
dosyalarının içindeki üretici, kaynak ve lisans metadata'sı korunmuştur.

- `vendor/models/plant.glb` — **[FREE] Pothos Potted Plant - Money Plant**,
  AllQuad. Kaynak:
  https://sketchfab.com/3d-models/free-pothos-potted-plant-money-plant-e9832f38484f4f85b3f9081b51fa3799
  Lisans: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- `vendor/models/chandelier.glb` — **Chandelier Black**, Pivoga. Kaynak:
  https://sketchfab.com/3d-models/chandelier-black-c66c187d0ed44d759d2b6564fbc83a9c
  Lisans: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

Üçüncü taraf modeller çalışma anında salon ölçeğine göre boyutlandırılır ve
yerleştirilir. Model yüklenemezse uygulamanın kendi sade, prosedürel
karşılıkları görünür kalır. Banklar ise uygulamaya ait hafif geometrilerle
üretilir; ayrı bir üçüncü taraf dosya içermez.

## Okul çevresi

- `assets/environment/kapakli.json`: © OpenStreetMap katkıcıları.
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
  kapsamında aynı lisansla dağıtılan türetilmiş harita verisidir.
  [Kaynak ve atıf koşulları](https://www.openstreetmap.org/copyright).
- Kaynak anlık görüntüsü: 3 Eylül 2026,
  https://api.openstreetmap.org/api/0.6/map?bbox=27.9435,41.3035,27.9612,41.3180
- Yalnızca coğrafi noktalar, nesne kimlikleri ve gerekli bina/yol/alan etiketleri
  tutulur; haritacı hesap metadata'sı dağıtılmaz. Bina tabanları gerçek açık
  harita geometrileridir; cephe dokuları ve eksik yükseklikler uygulamanın
  temsili çizimidir. Uygulama kodunun lisansından bağımsız olarak veri ODbL'dir.
- Yeniden üretim: kaynak OSM XML dosyasını indirdikten sonra
  `pwsh scripts/import-neighborhood.ps1 -SourcePath <dosya.osm>` çalıştırın.
  Kaynak tarihi değişirse betikteki `retrievedOn` alanını da güncelleyin.
  Dönüşüm, resmî okul koordinatına göre metre cinsinden doğu/güney ekseni kullanır.
  Kaynak JSON dosyası statik yayında da erişilebilir; atıf 3D görünümde kalıcıdır.

## Hava durumu

[Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Sabit okul konumu için model verisi kullanılır ve yalnızca çalışma anında
önbelleğe alınır. Kaynak adı 3D görünümde bağlantıyla gösterilir.
[API belgesi](https://open-meteo.com/en/docs) ve
[kullanım koşulları](https://open-meteo.com/en/terms).
Yağmur/gök gürültüsü sesi tarayıcıda sentezlenir; üçüncü taraf ses kaydı yoktur.
