/* ============================================
   SANAL GALERİ — MÜZİK OYNATICI
   YouTube IFrame API tabanlı arkaplan müziği
   ============================================ */

const PLAYLIST = [
  { id: 'HkklqoIQFpA', title: 'Erik Satie — Gymnopédies & Gnossiennes' },
  { id: 'jgpJVI3tDbY', title: 'Debussy — Clair de Lune & Preludes'      },
  { id: '4Tr0otuiQuU', title: 'Chopin — Nocturnes (Piano)'               },
  { id: 'bg9xKSh6HMQ', title: 'Ambient Classical — Gallery Mood'         },
  { id: 'lCOF9LN_Zxs', title: 'Peaceful Piano — Instrumental'            },
];

let player       = null;
let currentIndex = 0;
let isPlaying    = false;
let isMuted      = false;

/* ── LocalStorage tercih yükle ─────────────── */
const savedVolume = parseInt(localStorage.getItem('mw-volume') ?? '50', 10);
const savedMute   = localStorage.getItem('mw-mute') === 'true';
const savedOpen   = localStorage.getItem('mw-open') !== 'false'; // varsayılan açık

/* ── DOM referansları ───────────────────────── */
const elWidget  = document.getElementById('music-widget');
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
setTrackLabel();
if (!savedOpen) collapse();

/* ── YouTube IFrame API hazır callback ─────── */
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt-player', {
    height : '0',
    width  : '0',
    videoId: PLAYLIST[currentIndex].id,
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
};

function onPlayerReady(e) {
  e.target.setVolume(savedVolume);
  if (savedMute) {
    e.target.mute();
    isMuted = true;
    updateMuteBtn();
  }
}

function onStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    elPlay.textContent = '⏸';
    elPlay.setAttribute('aria-label', 'Durdur');
  } else if (
    e.data === YT.PlayerState.PAUSED ||
    e.data === YT.PlayerState.CUED
  ) {
    isPlaying = false;
    elPlay.textContent = '▶';
    elPlay.setAttribute('aria-label', 'Oynat');
  } else if (e.data === YT.PlayerState.ENDED) {
    nextTrack();
  }
}

/* ── Parça yükleme ──────────────────────────── */
function loadTrack(autoplay) {
  if (!player) return;
  setTrackLabel();
  if (autoplay) {
    player.loadVideoById(PLAYLIST[currentIndex].id);
  } else {
    player.cueVideoById(PLAYLIST[currentIndex].id);
  }
}

function setTrackLabel() {
  elTrack.textContent = PLAYLIST[currentIndex].title;
}

/* ── Kontrol fonksiyonları ──────────────────── */
function togglePlay() {
  if (!player) return;
  if (isPlaying) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function prevTrack() {
  currentIndex = (currentIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
  loadTrack(isPlaying);
}

function nextTrack() {
  currentIndex = (currentIndex + 1) % PLAYLIST.length;
  loadTrack(isPlaying);
}

function toggleMute() {
  if (!player) return;
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
  elMute.textContent = isMuted ? '🔇' : '🔊';
  elMute.setAttribute('aria-label', isMuted ? 'Sesi aç' : 'Sesi kapat');
}

function onVolumeChange() {
  if (!player) return;
  const v = parseInt(elVolume.value, 10);
  player.setVolume(v);
  localStorage.setItem('mw-volume', v);
  if (v === 0) {
    player.mute();
    isMuted = true;
  } else if (isMuted) {
    player.unMute();
    isMuted = false;
  }
  updateMuteBtn();
}

/* ── Widget collapse/expand ─────────────────── */
function collapse() {
  elBody.style.display    = 'none';
  elToggle.textContent    = '▲';
  elToggle.setAttribute('aria-label', 'Müziği göster');
  localStorage.setItem('mw-open', 'false');
}

function expand() {
  elBody.style.display    = '';
  elToggle.textContent    = '▼';
  elToggle.setAttribute('aria-label', 'Müziği gizle');
  localStorage.setItem('mw-open', 'true');
}

function toggleWidget() {
  if (elBody.style.display === 'none') {
    expand();
  } else {
    collapse();
  }
}

/* ── Event listener'lar ─────────────────────── */
elPlay  .addEventListener('click', togglePlay);
elPrev  .addEventListener('click', prevTrack);
elNext  .addEventListener('click', nextTrack);
elMute  .addEventListener('click', toggleMute);
elVolume.addEventListener('input',  onVolumeChange);
elToggle.addEventListener('click', toggleWidget);
