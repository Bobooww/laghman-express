/* Laghman Express — entry gate + order-link interceptor for the main site.
   Standalone, loads from <head> with defer and touches the DOM only after
   window load (React hydration is finished by then, so nothing mismatches).
   1) Every click on a legacy laghmanexpress.com/branch link is intercepted
      and sent to /order?k=<kitchen> — regardless of which render produced
      the anchor. Modified clicks (cmd/ctrl/shift) keep their open-in-new-tab
      behavior: the href is rewritten in place and the browser does the rest.
   2) First visit (no saved kitchen) shows a small trilingual location gate:
      nearest-by-geolocation, ZIP lookup, or manual pick. The choice lands in
      lx_kitchen / lx_region — the same keys the /order page uses. */
(function () {
  "use strict";
  var BASE = "/laghman-express/";
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var KITCHENS = [
    { slug: "20th-ave", api: true, region: "ny", name: "20th Ave",
      area: { en: "Bensonhurst", ru: "Бенсонхёрст", zh: "本森赫斯特" },
      lat: 40.6175, lng: -73.9903,
      zips: ["11204","11219","11214","11228","11230","11218","11220"] },
    { slug: "coney-island", api: true, region: "ny", name: "Coney Island Ave",
      area: { en: "Gravesend", ru: "Грейвсенд", zh: "格雷夫森德" },
      lat: 40.6060, lng: -73.9663,
      zips: ["11223","11229","11224","11210","11226"] },
    { slug: "emmons-ave", api: true, region: "ny", name: "Emmons Ave",
      area: { en: "Sheepshead Bay", ru: "Шипсхед-Бэй", zh: "羊头湾" },
      lat: 40.5838, lng: -73.9425,
      zips: ["11235"] },
    { slug: "alpharetta", api: false, region: "ga", name: "Alpharetta, GA",
      site: "https://www.laghmanexpressga.com/",
      area: { en: "Windward Plaza", ru: "Уиндворд-Плаза", zh: "温德沃德广场" },
      lat: 34.0900, lng: -84.2660,
      zips: ["30005","30004","30022","30009","30076","30097","30024"] }
  ];
  var STR = {
    en: { h: "Which kitchen is yours?", sub: "Each kitchen cooks its own menu. We'll remember your pick.",
      near: "Find the nearest kitchen", zip: "ZIP code", go: "Go", skip: "I'll choose later",
      phoneOnly: "Phone orders", noZip: "We don't recognize that ZIP — pick a kitchen below.",
      geoFail: "Couldn't get your location — pick a kitchen below.",
      locating: "Locating…" },
    ru: { h: "Какая кухня ваша?", sub: "У каждой кухни своё меню. Мы запомним ваш выбор.",
      near: "Найти ближайшую", zip: "ZIP-код", go: "ОК", skip: "Выберу позже",
      phoneOnly: "Заказ по телефону", noZip: "Не узнали этот ZIP — выберите кухню ниже.",
      geoFail: "Не удалось определить местоположение — выберите кухню ниже.",
      locating: "Определяем…" },
    zh: { h: "您常去哪家门店？", sub: "每家门店都有自己的菜单。我们会记住您的选择。",
      near: "查找最近的门店", zip: "邮编", go: "确定", skip: "稍后再选",
      phoneOnly: "电话点餐", noZip: "无法识别该邮编——请在下方选择门店。",
      geoFail: "无法获取位置——请在下方选择门店。",
      locating: "定位中…" }
  };
  function lang() {
    try { var s = localStorage.getItem("lx_lang"); if (s === "ru" || s === "zh" || s === "en") return s; } catch (e) {}
    var n = (navigator.language || "").toLowerCase();
    return n.indexOf("ru") === 0 ? "ru" : n.indexOf("zh") === 0 ? "zh" : "en";
  }
  function savedKitchen() { try { return localStorage.getItem("lx_kitchen"); } catch (e) { return null; } }
  function save(slug, region) {
    try { localStorage.setItem("lx_kitchen", slug); localStorage.setItem("lx_region", region); } catch (e) {}
  }

  /* -- 1. bulletproof legacy-link interception (capture phase) -- */
  function slugFor(href) { return href.indexOf("branch=2") !== -1 ? "coney-island" : "20th-ave"; }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (h.indexOf("laghmanexpress.com/branch") === -1) return;
    var k = slugFor(h);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      /* open-in-new-tab intent: fix the target, keep the gesture */
      a.setAttribute("href", BASE + "order?k=" + k);
      a.removeAttribute("target"); a.removeAttribute("rel");
      return;
    }
    e.preventDefault(); e.stopPropagation();
    save(k, "ny");
    location.href = BASE + "order?k=" + k;
  }, true);

  /* rewrite hrefs too, after hydration settles */
  function rewrite() {
    var as = document.querySelectorAll('a[href*="laghmanexpress.com/branch"]');
    for (var i = 0; i < as.length; i++) {
      as[i].setAttribute("href", BASE + "order?k=" + slugFor(as[i].getAttribute("href") || ""));
      as[i].removeAttribute("target"); as[i].removeAttribute("rel");
    }
  }

  /* -- 2. first-visit gate -- */
  function haversine(a, b, c, d) {
    var R = 3958.8, p = Math.PI / 180;
    var x = Math.sin((c - a) * p / 2), y = Math.sin((d - b) * p / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * p) * Math.cos(c * p) * y * y));
  }
  function regionByZip(z) {
    if (!/^\d{5}$/.test(z)) return null;
    for (var i = 0; i < KITCHENS.length; i++)
      if (KITCHENS[i].zips.indexOf(z) !== -1) return { kitchen: KITCHENS[i] };
    var p3 = z.slice(0, 3), n = +p3;
    if (n >= 300 && n <= 306) return { region: "ga" };
    if (n >= 100 && n <= 119) return { region: "ny" };
    return null;
  }
  function fmt1(x) { var s = x.toFixed(1); return lang() === "ru" ? s.replace(".", ",") : s; }
  function distLabel(mi) { return lang() === "zh" ? fmt1(mi * 1.609) + " 公里" : fmt1(mi) + (lang() === "ru" ? " мили" : " mi"); }
  var scrollY0 = 0;
  function lockScroll() {
    scrollY0 = window.scrollY || 0;
    document.body.style.top = -scrollY0 + "px";
    document.body.style.position = "fixed";
    document.body.style.left = "0"; document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  function unlockScroll() {
    document.body.style.position = ""; document.body.style.top = "";
    document.body.style.left = ""; document.body.style.right = ""; document.body.style.width = "";
    window.scrollTo(0, scrollY0);
  }
  function showGate() {
    var T = STR[lang()];
    var css = "#lxg{position:fixed;inset:0;z-index:99990;background:rgba(6,10,8,.82);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;font-family:'Instrument Sans',system-ui,sans-serif;opacity:0;transition:opacity .34s cubic-bezier(.19,1,.22,1)}" +
      "#lxg.in{opacity:1}" +
      "@media(min-width:700px){#lxg{align-items:center}}" +
      "#lxg .p{width:100%;max-width:460px;max-height:88vh;max-height:88svh;overflow:auto;overscroll-behavior:contain;background:#f7f2e6;color:#0f2417;border-radius:16px 16px 0 0;padding:1.4rem 1.3rem calc(1.7rem + env(safe-area-inset-bottom));box-shadow:0 -2px 10px rgba(3,8,5,.35),0 -26px 70px -14px rgba(3,8,5,.72);transform:translateY(36px);transition:transform .35s cubic-bezier(.19,1,.22,1)}" +
      "#lxg.in .p{transform:none}" +
      "@media(min-width:700px){#lxg .p{border-radius:16px;padding-bottom:1.7rem}}" +
      "#lxg ::selection{background:#16301f;color:#f7f2e6}" +
      "#lxg h2{margin:0 0 .3rem;font-family:'Fraunces','Noto Serif SC',Georgia,serif;font-size:1.45rem;letter-spacing:-.01em}" +
      "#lxg .s{margin:0 0 1rem;color:rgba(15,36,23,.65);font-size:.9rem;line-height:1.45}" +
      "#lxg .row{display:flex;gap:.5rem;margin-bottom:.9rem;flex-wrap:wrap}" +
      "#lxg button,#lxg input{font:inherit;touch-action:manipulation}" +
      "#lxg button:focus-visible,#lxg input:focus-visible{outline:2px solid #8a6420;outline-offset:2px}" +
      "#lxg .near{flex:1;min-width:150px;background:#e0b25c;border:0;border-radius:100px;padding:.7rem 1rem;font-weight:600;cursor:pointer}" +
      "#lxg .zipw{display:flex;gap:.4rem;flex:1;min-width:140px}" +
      "#lxg .zip{flex:1;min-width:0;border:1px solid rgba(15,36,23,.3);border-radius:100px;padding:.65rem .9rem;background:#fff}" +
      "#lxg .zgo{border:1px solid rgba(15,36,23,.3);background:none;border-radius:100px;padding:.65rem 1rem;cursor:pointer;font-weight:600}" +
      "#lxg .k{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid rgba(15,36,23,.18);border-radius:10px;padding:.85rem .9rem;margin:.4rem 0;cursor:pointer}" +
      "#lxg .k{transition:border-color .3s cubic-bezier(.19,1,.22,1),box-shadow .3s cubic-bezier(.19,1,.22,1),transform .2s cubic-bezier(.19,1,.22,1)}" +
      "@media(hover:hover){#lxg .k:hover{border-color:rgba(138,100,32,.5);box-shadow:0 8px 22px -14px rgba(15,36,23,.5)}}" +
      "#lxg .k:active{transform:scale(.99)}" +
      "#lxg .zip{caret-color:#8a6420}#lxg .zip::placeholder{color:rgba(15,36,23,.55)}" +
      "#lxg .k b{display:block;font-size:.98rem}" +
      "#lxg .k small{color:rgba(15,36,23,.7)}" +
      "#lxg .k .d{color:#8a6420;font-weight:600;font-size:.85rem;white-space:nowrap;margin-left:.6rem;font-variant-numeric:tabular-nums}" +
      "#lxg .err{color:#8a2b12;font-size:.82rem;min-height:1.1em;margin:.2rem 0 0}" +
      "#lxg .skip{display:block;margin:.7rem auto 0;background:none;border:0;color:rgba(15,36,23,.72);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:.85rem;padding:.4rem .8rem}" +
      "@media(prefers-reduced-motion:reduce){#lxg,#lxg .p{transition:none}}";
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var ov = document.createElement("div"); ov.id = "lxg";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "lxg-h");
    var p = document.createElement("div"); p.className = "p"; ov.appendChild(p);
    var h = document.createElement("h2"); h.id = "lxg-h"; h.textContent = T.h; p.appendChild(h);
    var s = document.createElement("p"); s.className = "s"; s.textContent = T.sub; p.appendChild(s);
    var row = document.createElement("div"); row.className = "row";
    var near = document.createElement("button"); near.className = "near"; near.textContent = T.near;
    if (!navigator.geolocation) near.hidden = true;
    var zipw = document.createElement("span"); zipw.className = "zipw";
    var zip = document.createElement("input"); zip.className = "zip"; zip.placeholder = T.zip;
    zip.inputMode = "numeric"; zip.maxLength = 5; zip.autocomplete = "postal-code";
    zip.setAttribute("aria-label", T.zip);
    var zgo = document.createElement("button"); zgo.className = "zgo"; zgo.textContent = T.go;
    zipw.appendChild(zip); zipw.appendChild(zgo);
    row.appendChild(near); row.appendChild(zipw); p.appendChild(row);
    var err = document.createElement("p"); err.className = "err"; err.setAttribute("aria-live", "polite");
    var list = document.createElement("div"); p.appendChild(list); p.appendChild(err);
    var skip = document.createElement("button"); skip.className = "skip"; skip.textContent = T.skip;
    p.appendChild(skip);

    var lastFocus = document.activeElement;
    function close() {
      ov.remove(); unlockScroll();
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
      document.removeEventListener("keydown", onKey, true);
    }
    function dismiss() {
      try { sessionStorage.setItem("lx_gate_skip", "1"); } catch (e) {}
      close();
    }
    function choose(k) {
      save(k.slug, k.region);
      close();
      if (k.api) { location.href = BASE + "order?k=" + k.slug; return; }
      if (k.site) { window.open(k.site, "_blank", "noopener"); return; }
      /* non-orderable kitchen: stay on the site, choice remembered */
    }
    function onKey(e) {
      if (e.key === "Escape") { dismiss(); return; }
      if (e.key !== "Tab") return;
      var f = Array.prototype.filter.call(
        ov.querySelectorAll("button,a[href],input"),
        function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ov.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !ov.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    }
    function card(k, withDist) {
      var b = document.createElement("button"); b.className = "k"; b.type = "button";
      var w = document.createElement("span");
      var bb = document.createElement("b"); bb.textContent = k.name; w.appendChild(bb);
      var sm = document.createElement("small");
      sm.textContent = k.area[lang()] + (k.api ? "" : " · " + (k.site ? "laghmanexpressga.com" : STR[lang()].phoneOnly));
        if (k.site) {
          var ar = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          ar.setAttribute("viewBox", "0 0 24 24"); ar.setAttribute("width", "12"); ar.setAttribute("height", "12");
          ar.setAttribute("fill", "none"); ar.setAttribute("stroke", "currentColor");
          ar.setAttribute("stroke-width", "1.9"); ar.setAttribute("stroke-linecap", "round");
          ar.setAttribute("stroke-linejoin", "round"); ar.setAttribute("aria-hidden", "true");
          ar.style.cssText = "display:inline-block;vertical-align:-1px;margin-left:.25rem";
          var ap = document.createElementNS("http://www.w3.org/2000/svg", "path");
          ap.setAttribute("d", "M8 16L16 8M9.5 8H16v6.5"); ar.appendChild(ap); sm.appendChild(ar);
        }
      w.appendChild(sm); b.appendChild(w);
      if (withDist && k._d != null) {
        var d = document.createElement("span"); d.className = "d";
        d.textContent = distLabel(k._d);
        b.appendChild(d);
      }
      b.onclick = function () { choose(k); };
      return b;
    }
    function renderList(pos) {
      list.innerHTML = "";
      var arr = KITCHENS.slice();
      if (pos) {
        arr.forEach(function (k) { k._d = haversine(pos.lat, pos.lng, k.lat, k.lng); });
        arr.sort(function (a, b) { return a._d - b._d; });
      }
      arr.forEach(function (k) { list.appendChild(card(k, !!pos)); });
    }
    near.onclick = function () {
      near.textContent = T.locating; near.disabled = true;
      navigator.geolocation.getCurrentPosition(function (po) {
        near.textContent = T.near; near.disabled = false; err.textContent = "";
        renderList({ lat: po.coords.latitude, lng: po.coords.longitude });
      }, function () {
        near.textContent = T.near; near.disabled = false;
        err.textContent = T.geoFail;
      }, { timeout: 8000, maximumAge: 600000 });
    };
    function zipGo() {
      var r = regionByZip(zip.value.trim());
      err.textContent = "";
      if (!r) { err.textContent = T.noZip; return; }
      if (r.kitchen && r.kitchen.api) { choose(r.kitchen); return; }
      /* region (or non-orderable kitchen) known: reorder, let the user pick */
      var rg = r.kitchen ? r.kitchen.region : r.region;
      var arr = KITCHENS.filter(function (k) { return k.region === rg; })
        .concat(KITCHENS.filter(function (k) { return k.region !== rg; }));
      list.innerHTML = "";
      arr.forEach(function (k) { list.appendChild(card(k, false)); });
    }
    zgo.onclick = zipGo;
    zip.addEventListener("keydown", function (e) { if (e.key === "Enter") zipGo(); });
    skip.onclick = dismiss;
    ov.addEventListener("click", function (e) { if (e.target === ov) dismiss(); });
    document.addEventListener("keydown", onKey, true);
    renderList(null);
    document.body.appendChild(ov);
    lockScroll();
    if (REDUCED) { ov.classList.add("in"); }
    else { requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add("in"); }); }); }
    try { near.hidden ? zip.focus({ preventScroll: true }) : near.focus({ preventScroll: true }); }
    catch (e) { near.hidden ? zip.focus() : near.focus(); }
    p.scrollTop = 0; /* the lockup leads — never open pre-scrolled past it */
  }

  function boot() {
    /* the craft section is retired (client 2026-08-22): stop its videos, drop the node */
    /* the NYT section takes the dark cloth; its stylesheet resists a head
       override, so paint it inline where nothing outranks it */
    var LX_CLOTH = "data:image/svg+xml,%3Csvg%20viewBox=%270%200%20120%20120%27%20xmlns=%27http://www.w3.org/2000/svg%27%20stroke=%27%23f5efdf%27%20stroke-width=%272.4%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%20fill=%27none%27%3E%3Cpath%20d=%27M60%2018%20102%2060%2060%20102%2018%2060Z%27/%3E%3Cpath%20d=%27M60%2034%2086%2060%2060%2086%2034%2060Z%27%20stroke-dasharray=%272%205%27/%3E%3Cpath%20d=%27M60%2054l6%206-6%206-6-6z%27/%3E%3Cpath%20d=%27M42%200%200%2042M78%200%20120%2042M0%2078%2042%20120M120%2078%2078%20120%27/%3E%3Cpath%20d=%27M21%200%200%2021M99%200%20120%2021M0%2099%2021%20120M120%2099%2099%20120%27%20stroke-dasharray=%272%205%27/%3E%3C/svg%3E";
    function lxRecognition() {
      var rec = document.querySelector(".recognition");
      if (!rec) return;
      rec.style.setProperty("background", "#183022", "important"); /* the craft cloth green — client reference */
      /* the section's own ::before is a radial glow that outranks the .cloth
         diamond layer, so the diamonds ride in as a layer of their own */
      rec.style.setProperty("isolation", "isolate");
      if (getComputedStyle(rec).position === "static") rec.style.position = "relative";
      if (!rec.querySelector(".lx-cloth")) {
        var cloth = document.createElement("div");
        cloth.className = "lx-cloth";
        cloth.setAttribute("aria-hidden", "true");
        cloth.style.cssText = "position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.05;background-size:120px 120px;background-image:url(" + LX_CLOTH + ")";
        rec.insertBefore(cloth, rec.firstChild);
      }
    }
    lxRecognition();
    setTimeout(lxRecognition, 1500); /* hydration may rebuild the section after us */
    setTimeout(lxRecognition, 4000);
    /* phones get the vertical cut of the hero film — the landscape one arrives
       auto-cropped to a squeezed slice on a portrait screen */
    function mobileHero() {
      if (!(window.matchMedia && matchMedia("(max-width: 720px)").matches)) return;
      var hv = document.querySelector(".hero video");
      if (!hv) return;
      var src = hv.currentSrc || hv.src || "";
      if (src.indexOf("hero-film-") === -1 && src.indexOf("craft-pull.mp4") === -1) return;
      if (src.indexOf("hero-film-c-m.mp4") !== -1) return;
      hv.poster = BASE + "assets/film/hero-film-c-m.jpg";
      hv.src = BASE + "assets/film/hero-film-c-m.mp4";
      hv.load();
      var pl = hv.play(); if (pl && pl.catch) pl.catch(function () {});
    }
    mobileHero();
    setTimeout(mobileHero, 1200); /* the page may attach its src after us */
    var cr = document.getElementById("craft");
    if (cr) {
      [].forEach.call(cr.querySelectorAll("video"), function (v) {
        try { v.pause(); v.removeAttribute("src"); v.removeAttribute("autoplay"); v.load(); } catch (e) {}
      });
      cr.remove();
    }
    rewrite();
    setTimeout(rewrite, 1500); /* late client re-renders */
    var skipped = false;
    try { skipped = sessionStorage.getItem("lx_gate_skip") === "1"; } catch (e) {}
    if (!savedKitchen() && !skipped) setTimeout(function () {
    /* if they already started reading, let them read — the gate can wait for a click */
    if ((window.scrollY || 0) > 40) { try { sessionStorage.setItem("lx_gate_skip", "1"); } catch (e) {} return; }
    showGate();
  }, 240);
  }
  if (document.readyState === "complete") setTimeout(boot, 300);
  else window.addEventListener("load", function () { setTimeout(boot, 300); });
})();
