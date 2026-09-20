(() => {
  'use strict';

  const isAppleMobile = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let anchor = null;
  let objectUrl = null;
  let wanted = false;

  function wavBlob() {
    const sampleRate = 8000;
    const seconds = 1;
    const frames = sampleRate * seconds;
    const bytes = 44 + frames * 2;
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);
    const write = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    write(0, 'RIFF');
    view.setUint32(4, bytes - 8, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, frames * 2, true);

    // Near-silent deterministic signal. Non-zero samples discourage iOS from
    // treating the media element as an empty/silent resource, while remaining inaudible.
    for (let i = 0; i < frames; i++) {
      const sample = (i % 97 === 0) ? 1 : 0;
      view.setInt16(44 + i * 2, sample, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function ensureAnchor() {
    if (anchor) return anchor;
    anchor = document.createElement('audio');
    anchor.id = 'ios-background-anchor';
    anchor.loop = true;
    anchor.preload = 'auto';
    anchor.setAttribute('playsinline', '');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.display = 'none';
    objectUrl = URL.createObjectURL(wavBlob());
    anchor.src = objectUrl;
    document.body.appendChild(anchor);
    return anchor;
  }

  function configureSession() {
    try {
      if (navigator.audioSession && 'type' in navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch {}

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Sleep Sounds',
          artist: '睡眠声景',
          album: 'tangkk.github.io'
        });
      } catch {}

      const bind = (name, eventName) => {
        try {
          navigator.mediaSession.setActionHandler(name, () => {
            window.dispatchEvent(new CustomEvent(eventName));
          });
        } catch {}
      };
      bind('play', 'sleep-sounds:media-play');
      bind('pause', 'sleep-sounds:media-pause');
      bind('stop', 'sleep-sounds:media-pause');
    }
  }

  async function start() {
    wanted = true;
    configureSession();
    if (!isAppleMobile) {
      try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } catch {}
      return;
    }
    const audio = ensureAnchor();
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.warn('iOS background anchor could not start', error);
    }
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } catch {}
  }

  function pause() {
    wanted = false;
    if (anchor) anchor.pause();
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; } catch {}
  }

  async function resumeIfNeeded() {
    configureSession();
    if (!wanted || !isAppleMobile) return;
    try { await ensureAnchor().play(); } catch {}
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeIfNeeded();
  });
  window.addEventListener('pageshow', resumeIfNeeded);

  window.iOSBackgroundAudio = { start, pause, resumeIfNeeded, isAppleMobile };
})();