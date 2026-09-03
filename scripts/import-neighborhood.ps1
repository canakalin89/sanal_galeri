param([Parameter(Mandatory=$true)][string]$SourcePath)
$ErrorActionPreference = 'Stop'
# OSM kullanıcı bilgilerini taşımadan yalnızca açık geometrileri ve gerekli etiketleri sakla.
$document = New-Object System.Xml.XmlDocument
$document.XmlResolver = $null
$document.Load((Resolve-Path -LiteralPath $SourcePath).Path)
$latitude = 41.3107562
$longitude = 27.9523363
$metersPerDegree = [Math]::PI * 6371008.8 / 180
$eastScale = $metersPerDegree * [Math]::Cos($latitude * [Math]::PI / 180)
$nodes = @{}
foreach ($node in $document.osm.node) {
  $nodes[$node.id] = @([Math]::Round(([double]$node.lon - $longitude) * $eastScale, 2), [Math]::Round(($latitude - [double]$node.lat) * $metersPerDegree, 2))
}
$allowedTags = @('name','building','building:levels','height','roof:shape','roof:height','highway','surface','lanes','landuse','natural','amenity','leisure','sport','barrier')
$features = @()
foreach ($way in $document.osm.way) {
  $tags = [ordered]@{}
  foreach ($tag in $way.tag) { if ($allowedTags -contains $tag.k) { $tags[$tag.k] = [string]$tag.v } }
  if (-not ($tags.Contains('building') -or $tags.Contains('highway') -or $tags.Contains('landuse') -or $tags.Contains('natural') -or $tags.Contains('amenity') -or $tags.Contains('leisure'))) { continue }
  $points = @($way.nd | ForEach-Object { ,$nodes[$_.ref] })
  if ($points.Count -lt 2 -or @($points | Where-Object { $null -eq $_ }).Count) { continue }
  $nearby = @($points | Where-Object { [Math]::Abs($_[0]) -le 1100 -and [Math]::Abs($_[1]) -le 1100 }).Count
  if (-not $nearby) { continue }
  $features += [ordered]@{ id = [string]$way.id; tags = $tags; points = $points }
}
$trees = @($document.osm.node | Where-Object { $_.tag.v -contains 'tree' } | ForEach-Object { ,$nodes[$_.id] })
$snapshot = [ordered]@{
  version = 1
  name = 'Karaağaç, Kapaklı / Tekirdağ'
  origin = [ordered]@{ latitude = $latitude; longitude = $longitude; timezone = 'Europe/Istanbul' }
  locationSource = 'https://azizsancaranadolu.meb.k12.tr/meb_iys_dosyalar/59/11/765062/okulumuz_hakkinda.html'
  source = 'https://api.openstreetmap.org/api/0.6/map?bbox=27.9435,41.3035,27.9612,41.3180'
  retrievedOn = '2026-09-03'
  attribution = '© OpenStreetMap contributors'
  license = 'https://opendatacommons.org/licenses/odbl/1-0/'
  coordinates = 'Metre; x doğu, z güney. Başlangıç okulun resmî harita konumudur.'
  limitations = 'Bina tabanları ve yollar OSM verisidir. Eksik katlar, cepheler ve düz arazi temsili; fotoğraf veya ölçülmüş 3D tarama değildir.'
  features = $features
  trees = $trees
}
$output = Join-Path $PSScriptRoot '..\assets\environment\kapakli.json'
$snapshot | ConvertTo-Json -Depth 12 -Compress | Set-Content -LiteralPath $output -Encoding utf8
Write-Output "$($features.Count) harita öğesi ve $($trees.Count) ağaç işlendi."
