/* =====================================================================
   patch2.js — patch.js DAN KEYIN ulang (asosiy skript va patch.js tagida):
       <script src="patch.js"></script>
       <script src="patch2.js"></script>
   ===================================================================== */
(() => {
  "use strict";

  /* ---------- 1. Tor oyna (<=900px): avtomatik 1 sahifali rejim ---------- */
  // Foydalanuvchining saqlangan tanlovi (localStorage) o'zgarmaydi:
  // oyna kengaysa, kitob rejimi o'zi qaytadi.
  let forced = false;

  function adapt(refresh) {
    const narrow = window.innerWidth <= 900;
    let changed = false;
    if (narrow && isBookMode) { forced = true; isBookMode = false; changed = true; }
    else if (!narrow && forced) { forced = false; isBookMode = true; changed = true; }
    if (changed && refresh && appInitialized) {
      applyBookModeClass();
      autoScale(false);
      updateUI(currentVerse || "first", false, false);
    }
  }

  const _toggleBook = toggleBookMode;
  toggleBookMode = function () {
    if (window.innerWidth <= 900) {
      showStatus("Tor oynada faqat 1 sahifali rejim mumkin", 2500);
      return;
    }
    _toggleBook();
  };

  const _init = initQuranApp;
  initQuranApp = function () {
    if (!appInitialized) adapt(false);   // ilova hali ochilmagan: faqat bayroqlarni o'rnatamiz
    _init();
  };

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => adapt(true), 150);
  });
  adapt(true);   // patch yuklanganda ilova allaqachon ochilgan bo'lishi mumkin

  /* ---------- 2. Sensorli ekran: bosish = oyat, uzoq bosib sudrash = bir necha oyat ---------- */
  const HOLD_MS = 350, MOVE_PX = 10;
  const fakeEvent = { button: 0, stopPropagation() {}, preventDefault() {} };
  const T = { timer: null, ov: null, x: 0, y: 0, active: false, moved: false };
  const isVerseOv = (el) => el && el.dataset && el.dataset.verse && !el.dataset.verse.endsWith("-000");
  const resetTouch = () => {
    clearTimeout(T.timer);
    T.timer = null; T.ov = null; T.active = false; T.moved = false;
  };
  const fireMouseUp = () => window.dispatchEvent(new MouseEvent("mouseup"));

  bookWrapper.addEventListener("touchstart", (e) => {
    resetTouch();
    if (e.touches.length !== 1) return;
    const ov = e.target.closest && e.target.closest(".overlay");
    if (!isVerseOv(ov)) return;
    T.ov = ov;
    T.x = e.touches[0].clientX;
    T.y = e.touches[0].clientY;
    T.timer = setTimeout(() => {          // uzoq bosildi: tanlashni boshlaymiz
      T.timer = null;
      T.active = true;
      T.ov.onmousedown(fakeEvent);
      if (navigator.vibrate) navigator.vibrate(15);
    }, HOLD_MS);
  }, { passive: true });

  bookWrapper.addEventListener("touchmove", (e) => {
    if (!T.ov) return;
    const p = e.touches[0];
    if (!T.active) {                      // hali tanlash boshlanmadi: barmoq siljisa, bu oddiy skroll
      if (Math.hypot(p.clientX - T.x, p.clientY - T.y) > MOVE_PX) {
        clearTimeout(T.timer); T.timer = null; T.moved = true;
      }
      return;
    }
    e.preventDefault();                   // tanlash paytida sahifa skroll bo'lmasin
    const el = document.elementFromPoint(p.clientX, p.clientY);
    const ov = el && el.closest && el.closest(".overlay");
    if (isVerseOv(ov)) updateDragSelectionRange(ov.dataset.verse);
  }, { passive: false });

  bookWrapper.addEventListener("touchend", (e) => {
    const wasActive = T.active, wasTap = !T.active && T.ov && !T.moved;
    const ov = T.ov;
    resetTouch();
    if (wasActive) {
      fireMouseUp();                      // tanlangan oyatlarni o'ynatish
    } else if (wasTap) {
      ov.onmousedown(fakeEvent);          // qisqa bosish: bitta oyat
      fireMouseUp();
    }
    if ((wasActive || wasTap) && e.cancelable) e.preventDefault();   // ikkilamchi "mouse" hodisalari bo'lmasin
  });

  bookWrapper.addEventListener("touchcancel", () => {
    if (T.active) isDraggingVerses = false;
    resetTouch();
  });

  bookWrapper.addEventListener("contextmenu", (e) => {   // uzoq bosganda brauzer menyusi chiqmasin
    if (e.target.closest && e.target.closest(".overlay")) e.preventDefault();
  });

  /* ---------- 3. Keyingi suraning butun audio fayli oldindan yuklanmasin ---------- */
  // Sura fayllari "N.mp3" (1-3 raqam), alohida oyat fayllari esa "NNNNNN.mp3".
  const _preload = preloadNextVerse;
  preloadNextVerse = function () {
    _preload();
    const s = preloadAudio.getAttribute("src") || "";
    if (/\/\d{1,3}\.mp3$/.test(s) && s !== audio.getAttribute("src")) {
      preloadAudio.removeAttribute("src");
      preloadAudio.load();                // yuklashni bekor qilamiz (trafik tejaladi)
    }
  };

  /* ---------- 4. Space: bosilgan tugma fokusda qolib, ikki marta ishlamasin ---------- */
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button");
    if (b && e.detail > 0) b.blur();      // faqat sichqoncha/sensor bosishi; klaviatura (Tab+Enter) buzilmaydi
  });
})();
