/* ============================================
   SANAL GALERİ — MÜZİK OYNATICI
   YouTube IFrame API tabanlı arkaplan müziği
   Playlist config.json'dan yüklenir.
   ============================================ */

const DEFAULT_PLAYLIST = [
  { id: 'HkklqoIQFpA', title: 'Erik Satie — Gymnopédies & Gnossiennes' },
  { id: 'jgpJVI3tDbY', title: 'Debussy — Clair de Lune & Preludes'      },
  { id: '4Tr0otuiQuU', title: 'Chopin — Nocturnes (Piano)'               },
  { id: 'bg9xKSh6HMQ', title: 'Ambient Classical — Gallery Mood'         },
  { id: 'lCOF9LN_Zxs', title: 'Peaceful Piano — Instrumental'            },
];

let PLAYLIST      = DEFAULT_PLAYLIST.slice();
let player        = null;
let currentIndex  = 0;
let isPlaying     = false;
let isMuted       = false;
let playerReady   = false;
let pendingPlay   = false; // oynat butonuna player hazır olmadan basıldıysa

/* ── LocalStorage tercih yükle ─────────────── */
const savedVolume = parseInt(localStorage.getItem('mw-volume') ?? '50', 10);
const savedMute   = localStorage.getItem('mw-mute') === 'true';
const savedOpen   = localStorage.getItem('mw-open') !== 'false';

/* ── DOM referansları ───────────────────────── */
const elBody    = document.getElementById('mw-body');
const elToggle  = document.getElementById('mw-toggle');
const elPlay    = document.getElementById('mw-play');
const elPrev    = document.getElementById('mw-prev');
const elNext    = document.getElementById('mw-next');
const elMute    = document.getElementById('mw-mute');
const elVolume  = document.getElementById('mw-volume');
const elTrack   = document.getElementById('mw-track');

/* ── Başlangıç UI ───────────────────────────── */
elVolume.value = savedVolume;
if (!savedOpen) collapse();
setTrackLabel();

/* ── config.json'dan playlist yükle ────────── */
fetch('config.json')
  .then(r => r.ok ? r.json() : null)
  .then(cfg => {
    if (cfg && Array.isArray(cfg.musicPlaylist) && cfg.musicPlaylist.length > 0) {
      PLAYLIST = cfg.musicPlaylist;
      // Player zaten hazırsa güncel videoyu cue et
      if (playerReady) {
        currentIndex = 0;
        player.cueVideoById(PLAYLIST[0].id);
      }
    }
    setTrackLabel();
  })
  .catch(() => {});

/* ── YouTube Player başlatma ────────────────── */
function initYTPlayer() {
  player = new YT.Player('yt-player', {
    height    : '200',
    width     : '200',
    videoId   : PLAYLIST[currentIndex].id,
    playerVars: {
      autoplay      : 0,
      controls      : 0,
      disablekb     : 1,
      rel           : 0,
      modestbranding: 1,
      playsinline   : 1,
    },
    events: {
      onReady      : onPlayerReady,
      onStateChange: onStateChange,
    },
  });
}

/* ── YouTube IFrame API hazır callback ─────── */
// API cache'den yüklenmişse callback çalışmaz — ikisini de kontrol et
if (window.YT && window.YT.Player) {
  initYTPlayer();
} else {
  window.onYouTubeIframeAPIReady = initYTPlayer;
}

function onPlayerReady(e) {
  playerReady = true;
  e.target.setVolume(savedVolume);
  if (savedMute) {
    e.target.mute();
    isMuted = true;
    updateMuteBtn();
  }
  // Buton daha önce basıldıysa şimdi başlat
  if (pendingPlay) {
    pendingPlay = false;
    player.playVideo();
  }
}

function onStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    elPlay.innerHTML = '&#9646;&#9646;';
    elPlay.setAttribute('aria-label', 'Durdur');
  } else if (
    e.data === YT.PlayerState.PAUSED ||
    e.data === YT.PlayerState.CUED
  ) {
    isPlaying = false;
    elPlay.innerHTML = '&#9654;';
    elPlay.setAttribute('aria-label', 'Oynat');
  } else if (e.data === YT.PlayerState.ENDED) {
    nextTrack();
  }
}

/* ── Parça yükleme ──────────────────────────── */
function loadTrack(autoplay) {
  if (!playerReady) return;
  if (currentIndex >= PLAYLIST.length) currentIndex = 0;
  setTrackLabel();
  if (autoplay) {
    player.loadVideoById(PLAYLIST[currentIndex].id);
  } else {
    player.cueVideoById(PLAYLIST[currentIndex].id);
  }
}

function setTrackLabel() {
  if (!PLAYLIST.length) { elTrack.textContent = '—'; return; }
  if (currentIndex >= PLAYLIST.length) currentIndex = 0;
  elTrack.textContent = PLAYLIST[currentIndex].title;
}

/* ── Kontrol fonksiyonları ──────────────────── */
function togglePlay() {
  if (!playerReady) {
    // Hazır değil — hazır olunca otomatik başlat
    pendingPlay = !pendingPlay;
    // Görsel geri bildirim
    elPlay.innerHTML = pendingPlay ? '…' : '&#9654;';
    return;
  }
  if (isPlaying) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function prevTrack() {
  if (!PLAYLIST.length) return;
  currentIndex = (currentIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
  loadTrack(isPlaying);
}

function nextTrack() {
  if (!PLAYLIST.length) return;
  currentIndex = (currentIndex + 1) % PLAYLIST.length;
  loadTrack(isPlaying);
}

function toggleMute() {
  if (!playerReady) return;
  if (isMuted) {
    player.unMute();
    isMuted = false;
  } else {
    player.mute();
    isMuted = true;
  }
  localStorage.setItem('mw-mute', isMuted);
  updateMuteBtn();
}

function updateMuteBtn() {
  elMute.innerHTML = isMuted ? '&#128263;' : '&#128266;';
  elMute.setAttribute('aria-label', isMuted ? 'Sesi aç' : 'Sesi kapat');
}

function onVolumeChange() {
  if (!playerReady) return;
  const v = parseInt(elVolume.value, 10);
  player.setVolume(v);
  localStorage.setItem('mw-volume', v);
  if (v === 0) {
    player.mute(); isMuted = true;
  } else if (isMuted) {
    player.unMute(); isMuted = false;
  }
  updateMuteBtn();
}

/* ── Widget collapse/expand ─────────────────── */
function collapse() {
  elBody.style.display = 'none';
  elToggle.innerHTML   = '&#9650;';
  elToggle.setAttribute('aria-label', 'Müziği göster');
  localStorage.setItem('mw-open', 'false');
}

function expand() {
  elBody.style.display = '';
  elToggle.innerHTML   = '&#9660;';
  elToggle.setAttribute('aria-label', 'Müziği gizle');
  localStorage.setItem('mw-open', 'true');
}

function toggleWidget() {
  elBody.style.display === 'none' ? expand() : collapse();
}

/* ── Event listener'lar ─────────────────────── */
elPlay  .addEventListener('click', togglePlay);
elPrev  .addEventListener('click', prevTrack);
elNext  .addEventListener('click', nextTrack);
elMute  .addEventListener('click', toggleMute);
elVolume.addEventListener('input',  onVolumeChange);
elToggle.addEventListener('click', toggleWidget);
