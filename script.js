// Coca-Cola Zero Sugar - Interactive Scroll Experience
(function () {
  'use strict';

  const TOTAL_FRAMES = 214;
  const FRAME_DIR = './frames/';
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXT = '.jpg';

  // Elements
  const canvas = document.getElementById('canvas-frame');
  const ctx = canvas.getContext('2d');
  const preloader = document.getElementById('preloader');
  const loaderBar = document.getElementById('loader-bar-fill');
  const loaderPercent = document.getElementById('loader-percentage');
  const loaderStatus = document.getElementById('loader-status');
  const navbar = document.getElementById('navbar') || document.querySelector('.navbar');
  const heroSection = document.getElementById('hero') || document.getElementById('scroll-track');
  const heroTitleOverlay = document.getElementById('hero-title-overlay');
  const hudTimeline = document.querySelector('.hud-timeline');
  const scrollCue = document.getElementById('scroll-cue');
  const timelineProgress = document.getElementById('timeline-progress-bar');
  const frameCounter = document.getElementById('frame-counter');
  const chapterBtns = document.querySelectorAll('.chapter-btn');
  const storyCards = document.querySelectorAll('.story-card');
  const soundToggleBtn = document.getElementById('sound-toggle');
  const autoPlayBtn = document.getElementById('autoplay-toggle');

  // State
  const images = [];
  let loadedCount = 0;
  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnFrame = -1;
  let isAutoPlaying = false;
  let autoPlaySpeed = 0.35;
  let autoPlayProgress = 0;
  let isAudioActive = false;
  let audioCtx = null;
  let noiseNode = null;
  let fizzGainNode = null;
  let bubbleInterval = null;

  // Format frame filename with 3-digit padding (001, 002, ...)
  function getFrameUrl(index) {
    const num = String(index + 1).padStart(3, '0');
    return `${FRAME_DIR}${FRAME_PREFIX}${num}${FRAME_EXT}`;
  }

  // Preload frames with smooth progress update
  function preloadImages() {
    let loaded = 0;
    const loadBatchSize = 12; // concurrency
    let activeIndex = 0;

    function loadNext() {
      if (activeIndex >= TOTAL_FRAMES) return;
      const idx = activeIndex++;
      const img = new Image();
      img.src = getFrameUrl(idx);

      img.onload = () => {
        images[idx] = img;
        loaded++;
        onProgress(loaded);
        loadNext();
      };

      img.onerror = () => {
        console.warn(`Frame failed to load: ${img.src}`);
        // Fallback to previous frame if available
        images[idx] = images[idx - 1] || null;
        loaded++;
        onProgress(loaded);
        loadNext();
      };
    }

    function onProgress(count) {
      const pct = Math.floor((count / TOTAL_FRAMES) * 100);
      if (loaderBar) loaderBar.style.width = `${pct}%`;
      if (loaderPercent) loaderPercent.textContent = `${pct}%`;

      if (pct < 30) {
        if (loaderStatus) loaderStatus.textContent = 'Gathering ingredients...';
      } else if (pct < 70) {
        if (loaderStatus) loaderStatus.textContent = 'Infusing carbonation & chill...';
      } else {
        if (loaderStatus) loaderStatus.textContent = 'Polishing the contour bottle...';
      }

      if (count >= TOTAL_FRAMES) {
        onLoadingComplete();
      }
    }

    // Start initial batch
    for (let i = 0; i < loadBatchSize && i < TOTAL_FRAMES; i++) {
      loadNext();
    }
  }

  function onLoadingComplete() {
    setTimeout(() => {
      preloader.classList.add('loaded');
      // Trigger initial resize & draw first frame
      resizeCanvas();
      drawFrame(0);
      updateUI(getScrollProgress(), 0);
      startRenderLoop();
    }, 400);
  }

  // Handle Retina High-DPI canvas sizing
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Redraw current frame
    if (images[Math.round(currentFrame)]) {
      lastDrawnFrame = -1; // force render
      drawFrame(Math.round(currentFrame));
    }
  }

  window.addEventListener('resize', resizeCanvas);

  // Render a specific frame onto the canvas with crisp aspect-ratio containment
  function drawFrame(index) {
    const img = images[index];
    if (!img) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    const iw = img.naturalWidth || 1920;
    const ih = img.naturalHeight || 1080;
    const imgRatio = iw / ih;
    const canvasRatio = w / h;

    let drawW, drawH, drawX, drawY;

    // Responsive scaling
    if (w < 768) {
      // Mobile: allow slight crop on sides so bottle is bold and centered
      if (canvasRatio > imgRatio) {
        drawW = w;
        drawH = w / imgRatio;
      } else {
        drawH = h * 0.95;
        drawW = drawH * imgRatio;
      }
    } else {
      // Desktop: preserve entire frame with slight 1.02x scale for impact
      const scale = Math.min(w / iw, h / ih) * 1.02;
      drawW = iw * scale;
      drawH = ih * scale;
    }

    drawX = (w - drawW) / 2;
    drawY = (h - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    lastDrawnFrame = index;
  }

  // Calculate scroll position strictly relative to the Hero animation section
  function getScrollProgress() {
    if (!heroSection) return 0;
    const rect = heroSection.getBoundingClientRect();
    const scrollableDistance = heroSection.offsetHeight - window.innerHeight;
    if (scrollableDistance <= 0) return 0;
    const currentScroll = -rect.top;
    // Clamped strictly between [0, 1] within the hero
    const progress = Math.max(0, Math.min(1, currentScroll / scrollableDistance));
    return progress;
  }

  // Update target frame from scroll
  function updateScrollTarget() {
    if (isAutoPlaying) return;
    const progress = getScrollProgress();
    // Scrub through all 214 frames exclusively inside the hero
    targetFrame = progress * (TOTAL_FRAMES - 1);
    updateUI(progress, Math.round(targetFrame));
  }

  window.addEventListener('scroll', updateScrollTarget, { passive: true });

  // Update Story Cards, Chapter dots, and Timeline
  function updateUI(progress, frameIdx) {
    const isPastHero = progress >= 0.98;

    // Transparent navigation bar at top, frosted glass on scroll
    if (navbar) {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    // Hide HUD timeline & cue once scrolled past the hero section into the rest of the site
    if (hudTimeline) {
      if (isPastHero) {
        hudTimeline.classList.add('hidden');
      } else {
        hudTimeline.classList.remove('hidden');
      }
    }

    if (scrollCue) {
      if (progress > 0.03 || isPastHero) {
        scrollCue.classList.add('hidden');
      } else {
        scrollCue.classList.remove('hidden');
      }
    }

    // Timeline bar & Frame counter
    if (timelineProgress) {
      timelineProgress.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if (frameCounter) {
      frameCounter.textContent = `${String(frameIdx + 1).padStart(3, '0')} / ${TOTAL_FRAMES}`;
    }

    // Fade away top headline & subheadline when scrolling past 30% of the scroll animation section
    if (heroTitleOverlay) {
      const fadeLimit = 0.30;
      if (progress >= fadeLimit) {
        heroTitleOverlay.style.opacity = '0';
        heroTitleOverlay.style.pointerEvents = 'none';
        heroTitleOverlay.style.transform = 'translate(-50%, -30px)';
      } else {
        const ratio = progress / fadeLimit; // 0.0 at top, 1.0 at 30%
        const opacity = Math.max(0, 1 - ratio);
        const translateY = -ratio * 30;
        heroTitleOverlay.style.opacity = opacity.toFixed(3);
        heroTitleOverlay.style.pointerEvents = opacity <= 0.02 ? 'none' : 'auto';
        heroTitleOverlay.style.transform = `translate(-50%, ${translateY.toFixed(1)}px)`;
      }
    }

    // Story Stages across the hero scroll
    const stageRanges = [
      { min: 0.12, max: 0.30 },
      { min: 0.34, max: 0.52 },
      { min: 0.55, max: 0.75 },
      { min: 0.78, max: 0.98 }
    ];

    storyCards.forEach((card, i) => {
      const range = stageRanges[i];
      if (range && progress >= range.min && progress <= range.max) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update chapter buttons
    chapterBtns.forEach((btn, i) => {
      const range = stageRanges[i];
      if (range && progress >= range.min - 0.04 && progress <= range.max + 0.04) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Modulate audio fizz intensity based on movement
    if (isAudioActive && fizzGainNode) {
      const velocity = Math.abs(targetFrame - currentFrame);
      const intensity = Math.min(1, 0.2 + velocity * 0.1);
      fizzGainNode.gain.setTargetAtTime(intensity * 0.12, audioCtx.currentTime, 0.08);
    }
  }

  // Animation Lerp Loop for 60/120fps buttery smooth scrubbing
  function startRenderLoop() {
    function tick() {
      if (isAutoPlaying) {
        autoPlayProgress += 0.0022 * autoPlaySpeed;
        if (autoPlayProgress > 0.98) {
          autoPlayProgress = 0.98;
          toggleAutoplay();
        }
        targetFrame = autoPlayProgress * (TOTAL_FRAMES - 1);
        updateUI(autoPlayProgress, Math.round(targetFrame));

        // Sync page scroll with auto play within hero
        if (heroSection) {
          const scrollableDistance = heroSection.offsetHeight - window.innerHeight;
          window.scrollTo(0, heroSection.offsetTop + autoPlayProgress * scrollableDistance);
        }
      }

      // Smooth interpolation (lerp)
      const diff = targetFrame - currentFrame;
      if (Math.abs(diff) > 0.01) {
        currentFrame += diff * 0.16;
      } else {
        currentFrame = targetFrame;
      }

      const frameToDraw = Math.round(currentFrame);
      if (frameToDraw !== lastDrawnFrame && images[frameToDraw]) {
        drawFrame(frameToDraw);
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // Chapter Click Navigation strictly within Hero
  chapterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!heroSection) return;
      const targetPct = parseFloat(btn.dataset.target || 0);
      const scrollableDistance = heroSection.offsetHeight - window.innerHeight;
      const targetScrollTop = heroSection.offsetTop + targetPct * scrollableDistance;

      if (isAutoPlaying) toggleAutoplay();

      window.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });

      if (isAudioActive) playChime();
    });
  });

  // Autoplay / Auto-Tour Toggle
  if (autoPlayBtn) {
    autoPlayBtn.addEventListener('click', toggleAutoplay);
  }

  function toggleAutoplay() {
    isAutoPlaying = !isAutoPlaying;
    if (isAutoPlaying) {
      autoPlayBtn.classList.add('active');
      autoPlayBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <span>Pause Tour</span>
      `;
      autoPlayProgress = getScrollProgress();
      if (autoPlayProgress >= 0.98) autoPlayProgress = 0;
    } else {
      autoPlayBtn.classList.remove('active');
      autoPlayBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span>Auto Tour</span>
      `;
    }
  }

  // Stop autoplay on manual user scroll
  window.addEventListener('wheel', () => {
    if (isAutoPlaying) toggleAutoplay();
  }, { passive: true });

  window.addEventListener('touchstart', () => {
    if (isAutoPlaying) toggleAutoplay();
  }, { passive: true });

  // Web Audio Procedural Fizz Synthesizer
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', toggleSound);
  }

  function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // 1. Generate Pink / White Noise for effervescent carbonation fizz
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.06;
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    // Bandpass filter to isolate crisp sparkling fizz frequencies (3kHz - 8kHz)
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 4500;
    bandpass.Q.value = 1.2;

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1200;

    fizzGainNode = audioCtx.createGain();
    fizzGainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

    noiseNode.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(fizzGainNode);
    fizzGainNode.connect(audioCtx.destination);

    noiseNode.start(0);

    // 2. Procedural micro-bubble pops
    bubbleInterval = setInterval(() => {
      if (!isAudioActive || !audioCtx) return;
      playBubblePop();
    }, 180);
  }

  function playBubblePop() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    const freq = 1400 + Math.random() * 2200;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioCtx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  }

  function playChime() {
    if (!audioCtx) return;
    // Pleasant glass/ice clink sound
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  }

  function toggleSound() {
    if (!audioCtx) {
      initAudio();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    isAudioActive = !isAudioActive;

    if (isAudioActive) {
      soundToggleBtn.classList.add('active');
      fizzGainNode.gain.setTargetAtTime(0.08, audioCtx.currentTime, 0.1);
      playChime();
    } else {
      soundToggleBtn.classList.remove('active');
      fizzGainNode.gain.setTargetAtTime(0.00001, audioCtx.currentTime, 0.1);
    }
  }

  // Kickoff image preloading
  preloadImages();

})();

