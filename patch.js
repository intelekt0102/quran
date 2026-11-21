/* =====================================================================
   patch.js — "Qur'on tilovati" uchun tuzatishlar.
   Ulash: asosiy <script>...</script> blokidan KEYIN, </body> dan oldin:
          <script src="patch.js"></script>
   ===================================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---------- 0. CSS: zoom qirqilmasin, toast panel yashirilganda ham ko'rinsin ---------- */
  const st = document.createElement("style");
  st.textContent = `
    .book-wrapper.two-page .quran-page-container,
    .book-wrapper.single-page .quran-page-container { max-width: none !important; }
    .status-toast.yashirin.visible { opacity: 1; transform: translateY(0); }`;
  document.head.appendChild(st);

  /* ---------- 1. Klaviatura: Ctrl/Alt/Meta kombinatsiyalari, repeat, login ortida ---------- */
  const oldKey = document.onkeydown;
  document.onkeydown = (e) => {
    if (!$("authLayer").classList.contains("hidden")) return;      // login oynasi ochiq
    if (shortcutModal.style.display === "flex" && e.key === "Escape") { toggleModal(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;                // Ctrl+R, Ctrl+P, Ctrl+V ... ishlasin
    if (e.repeat && !/^Arrow/.test(e.key)) return;                 // Space ushlab turilsa titramasin
    return oldKey.call(document, e);
  };

  /* ---------- 2. Sahifa chegarasida bir xil oyat ikki marta o'qilmasin ---------- */
  const _next = nextAudio, _prev = prevAudio;
  nextAudio = function () {
    const prev = currentVerse, pr = openRightPage;
    _next();
    if (prev && currentVerse === prev && openRightPage !== pr) _next();
  };
  prevAudio = function () {
    const prev = currentVerse, pr = openRightPage;
    _prev();
    if (prev && currentVerse === prev && openRightPage !== pr) _prev();
  };

  /* ---------- 3. Yodlash rejimi (yopilgan): sahifa almashganda avtomatik ochilmasin/o'ynamasin ---------- */
  let quiet = false;
  const _upd = updateUI, _play = playVerse;
  updateUI = function (mode = "first", scroll = false, anim = true) {
    quiet = document.body.classList.contains("memorize-masked") && (mode === "first" || mode === "last");
    try { _upd(mode, scroll, anim); } finally { quiet = false; }
  };
  playVerse = function (...args) {
    if (quiet) {
      audio.pause();
      playBtn.innerHTML = ICONS.play;
      highlightActiveSurah();
      return;
    }
    return _play(...args);
  };

  /* ---------- 4. localStorage qiymatlarini tekshirish ---------- */
  let fixed = false;
  if (!Number.isInteger(currentPage) || currentPage < 1 || currentPage > 604) {
    currentPage = 1; localStorage.setItem("page", 1); fixed = true;
  }
  if (!["audios1", "audios2"].includes(currentFolder)) {
    currentFolder = "audios1"; localStorage.setItem("audioFolder", currentFolder);
    folderSelect.value = currentFolder; fixed = true;
  }
  if (fixed && appInitialized) updateUI("first", false, false);

  /* ---------- 5. Rasm va audio xatolari: qayta urinish + xabar ---------- */
  [rightImg, leftImg].forEach((img) => {
    let tries = 0;
    img.addEventListener("load", () => { tries = 0; });
    img.onerror = () => {
      if (!img.getAttribute("src")) return;
      if (tries < 2) {
        tries++;
        const base = img.src.split("?")[0];
        setTimeout(() => { img.src = `${base}?r=${Date.now()}`; }, 800 * tries);
      } else {
        showStatus("Rasm yuklanmadi. Internetni tekshiring.", 4000);
      }
    };
  });
  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    playBtn.innerHTML = ICONS.play;
    showStatus("Audio yuklanmadi. Internetni tekshiring.", 4000);
  });

  /* ---------- 6. Qidiruv: aniq raqam moslik, lotin/kirill, xavfsiz highlight, debounce ---------- */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  highlightSearchMatch = function (text, raw) {
    const q = raw.trim();
    if (!q) return esc(text);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let out = "", last = 0, m;
    while ((m = re.exec(text))) {
      if (!m[0]) break;
      out += esc(text.slice(last, m.index)) + '<mark class="search-hl">' + esc(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  };

  const normCache = new Map();
  const norm = (k, t) => {
    let v = normCache.get(k);
    if (v === undefined) { v = normalizeUz(t); normCache.set(k, v); }
    return v;
  };

  renderGlobalTranslationSearch = function (rawQuery) {
    const q = rawQuery.toLowerCase().trim();
    const key = `${currentTranslationType}__${q}`;
    if (translationContent.dataset.renderedSearchKey === key) {
      if (currentVerse) highlightActiveTranslation(currentVerse);
      return;
    }
    translationContent.dataset.renderedSearchKey = key;
    translationContent.innerHTML = "";
    if (typeof translations === "undefined") {
      translationContent.innerText = "translation.js файли топилмади ёки уланмаган.";
      return;
    }
    const nq = normalizeUz(q);
    const ref = q.match(/^(\d{1,3})\s*[:\-.\s]\s*(\d{0,3})$/);   // 2:255, 2-255, 2 255, 2:
    const onlyNum = /^\d{1,3}$/.test(q);                          // 2  -> 2-сура
    const results = [];
    for (const [k, d] of Object.entries(translations)) {
      const text = d && d[currentTranslationType];
      if (!text) continue;
      const [s, a] = k.split("_").map(Number);
      const title = surahNamesByNumber[s] || `${s}-сура`;
      let ok;
      if (ref) ok = s === +ref[1] && (ref[2] === "" || a === +ref[2]);
      else if (onlyNum) ok = s === +q;
      else ok = text.toLowerCase().includes(q) ||
                (nq && (norm(currentTranslationType + k, text).includes(nq) || normalizeUz(title).includes(nq)));
      if (ok) results.push({ sNum: s, aNum: a, text, surahTitle: title });
    }
    transHeaderTitle.innerText = `Қидирув натижалари (${results.length} та)`;
    if (!results.length) {
      translationContent.innerText = `"${rawQuery}" бўйича ҳеч қандай оят топилмади.`;
      return;
    }
    const MAX_SHOW = 200;
    results.slice(0, MAX_SHOW).forEach((r) => {
      const verseCode = `${pad(r.sNum)}-${pad(r.aNum)}`;
      const pageNum = getPageForVerse(verseCode);
      const item = document.createElement("div");
      item.className = "trans-verse-item";
      if (currentVerse === verseCode) item.classList.add("active-trans");
      item.dataset.verse = verseCode;

      const badge = document.createElement("div");
      badge.className = "trans-page-badge";
      badge.style.margin = "0 0 6px 0";
      badge.innerText = `${r.surahTitle} (${r.sNum}:${r.aNum})` + (pageNum ? ` • ${pageNum}-бет` : "");

      const textDiv = document.createElement("div");
      textDiv.innerHTML = highlightSearchMatch(r.text, rawQuery);
      item.append(badge, textDiv);

      item.onclick = (e) => {
        e.stopPropagation();
        const open = isBookMode && openLeftPage ? [openRightPage, openLeftPage] : [openRightPage];
        if (pageNum && !open.includes(pageNum)) { currentPage = pageNum; updateUI(verseCode, true, true); }
        else playVerse(verseCode, true, true, false);
      };
      translationContent.appendChild(item);
    });
    if (results.length > MAX_SHOW) {
      const more = document.createElement("div");
      more.style.cssText = "text-align:center;padding:10px;font-size:12px;color:#94b8b3;";
      more.innerText = `Яна ${results.length - MAX_SHOW} та натижа бор. Қидирув сўзини аниқроқ ёзинг.`;
      translationContent.appendChild(more);
    }
  };

  let searchTimer = null;
  translationSearchInput.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateTranslationContent, 200);
  };

  /* ---------- 7. Login: xavfsiz kontekst xabari + ilova ochiq tursa muddatni tekshirish ---------- */
  if (!window.crypto || !crypto.subtle) {
    $("authError").textContent = "Login ишлаши учун HTTPS, localhost ёки файл (file://) орқали очинг.";
  }
  setInterval(() => {
    if (!appInitialized || !$("authLayer").classList.contains("hidden")) return;
    try {
      const s = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY));
      const u = ALLOWED_USERS.find((x) => x.username === s.user && x.passwordHash === s.passwordHash);
      if (!u || isUserExpired(u)) {
        logoutUser();
        $("authError").textContent = "Обуна муддати тугади ёки сессия бекор қилинди.";
      }
    } catch (_) { logoutUser(); }
  }, 60000);
})();
