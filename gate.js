/* Laghman Express — entry gate + order-link interceptor for the main site.
   Standalone, loads from <head> with defer and touches the DOM only after
   window load (React hydration is finished by then, so nothing mismatches).
   1) Every click on a legacy laghmanexpress.com/branch link is intercepted
      and sent to /order?k=<kitchen> — regardless of which render produced
      the anchor.
   2) First visit (no saved kitchen) shows a small trilingual location gate:
      nearest-by-geolocation, ZIP lookup, or manual pick. The choice lands in
      lx_kitchen / lx_region — the same keys the /order page uses. */
(function () {
  "use strict";
  var BASE = "/laghman-express/";
  var KITCHENS = [
    { slug: "20th-ave", api: true, region: "ny", name: "20th Ave",
      area: { en: "Bensonhurst", ru: "Бенсонхёрст", zh: "本森赫斯特" },
      lat: 40.6175, lng: -73.9903,
      zips: ["11204","11219","11214","11228","11230","11218","11220"] },
    { slug: "coney-island", api: true, region: "ny", name: "Coney Island Ave",
      area: { en: "Gravesend", ru: "Грейвсенд", zh: "格雷夫森德" },
      lat: 40.6060, lng: -73.9663,
      zips: ["11223","11229","11224","11210","11235","11226"] },
    { slug: "alpharetta", api: false, region: "ga", name: "Alpharetta, GA",
      area: { en: "Windward Plaza", ru: "Уиндворд-Плаза", zh: "温德沃德广场" },
      lat: 34.0900, lng: -84.2660,
      zips: ["30005","30004","30022","30009","30076","30097","30024"] }
  ];
  var STR = {
    en: { h: "Which kitchen is yours?", sub: "Each kitchen cooks its own menu. We'll remember your pick.",
      near: "Find the nearest", zip: "ZIP code", go: "Go", skip: "I'll choose later",
      phoneOnly: "Phone orders", noZip: "We don't recognise that ZIP — pick a kitchen below.",
      locating: "Locating…" },
    ru: { h: "Какая кухня ваша?", sub: "У каждой кухни своё меню. Мы запомним выбор.",
      near: "Найти ближайшую", zip: "ZIP-код", go: "Ок", skip: "Выберу позже",
      phoneOnly: "Заказ по телефону", noZip: "Не узнали этот ZIP — выберите кухню ниже.",
      locating: "Определяю…" },
    zh: { h: "您常去哪家门店？", sub: "每家门店都有自己的菜单。我们会记住您的选择。",
      near: "查找最近的", zip: "邮编", go: "确定", skip: "稍后再选",
      phoneOnly: "电话点餐", noZip: "无法识别该邮编——请在下方选择门店。",
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
  function orderUrl() {
    var k = savedKitchen();
    return BASE + "order" + (k ? "?k=" + encodeURIComponent(k) : "");
  }

  /* -- 1. bulletproof legacy-link interception (capture phase) -- */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (h.indexOf("laghmanexpress.com/branch") !== -1) {
      e.preventDefault(); e.stopPropagation();
      var k = h.indexOf("branch=2") !== -1 ? "coney-island" : "20th-ave";
      save(k, "ny");
      location.href = BASE + "order?k=" + k;
    }
  }, true);

  /* rewrite hrefs too, after hydration settles */
  function rewrite() {
    var as = document.querySelectorAll('a[href*="laghmanexpress.com/branch"]');
    for (var i = 0; i < as.length; i++) {
      var k = (as[i].getAttribute("href") || "").indexOf("branch=2") !== -1 ? "coney-island" : "20th-ave";
      as[i].setAttribute("href", BASE + "order?k=" + k);
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
    if ((n >= 100 && n <= 119) || p3 === "112") return { region: "ny" };
    return null;
  }
  function showGate() {
    var T = STR[lang()];
    var css = "#lxg{position:fixed;inset:0;z-index:99990;background:rgba(6,10,8,.82);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;font-family:'Instrument Sans',system-ui,sans-serif}" +
      "@media(min-width:700px){#lxg{align-items:center}}" +
      "#lxg .p{width:100%;max-width:460px;background:#f7f2e6;color:#0f2417;border-radius:16px 16px 0 0;padding:1.4rem 1.3rem 1.7rem;box-shadow:0 -20px 60px rgba(0,0,0,.4)}" +
      "@media(min-width:700px){#lxg .p{border-radius:16px}}" +
      "#lxg h2{margin:0 0 .3rem;font-family:Georgia,'Noto Serif SC',serif;font-size:1.45rem;letter-spacing:-.01em}" +
      "#lxg .s{margin:0 0 1rem;color:rgba(15,36,23,.65);font-size:.9rem;line-height:1.45}" +
      "#lxg .row{display:flex;gap:.5rem;margin-bottom:.9rem;flex-wrap:wrap}" +
      "#lxg button,#lxg input{font:inherit}" +
      "#lxg .near{flex:1;min-width:150px;background:#e0b25c;border:0;border-radius:100px;padding:.7rem 1rem;font-weight:600;cursor:pointer}" +
      "#lxg .zipw{display:flex;gap:.4rem;flex:1;min-width:140px}" +
      "#lxg .zip{flex:1;min-width:0;border:1px solid rgba(15,36,23,.3);border-radius:100px;padding:.65rem .9rem;background:#fff}" +
      "#lxg .zgo{border:1px solid rgba(15,36,23,.3);background:none;border-radius:100px;padding:.65rem 1rem;cursor:pointer;font-weight:600}" +
      "#lxg .k{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid rgba(15,36,23,.18);border-radius:10px;padding:.75rem .9rem;margin:.4rem 0;cursor:pointer}" +
      "#lxg .k b{display:block;font-size:.98rem}" +
      "#lxg .k small{color:rgba(15,36,23,.6)}" +
      "#lxg .k .d{color:#8a6420;font-weight:600;font-size:.85rem;white-space:nowrap;margin-left:.6rem}" +
      "#lxg .err{color:#8a2b12;font-size:.82rem;min-height:1.1em;margin:.2rem 0 0}" +
      "#lxg .skip{display:block;margin:.7rem auto 0;background:none;border:0;color:rgba(15,36,23,.55);text-decoration:underline;cursor:pointer;font-size:.85rem}";
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var ov = document.createElement("div"); ov.id = "lxg";
    var p = document.createElement("div"); p.className = "p"; ov.appendChild(p);
    var h = document.createElement("h2"); h.textContent = T.h; p.appendChild(h);
    var s = document.createElement("p"); s.className = "s"; s.textContent = T.sub; p.appendChild(s);
    var row = document.createElement("div"); row.className = "row";
    var near = document.createElement("button"); near.className = "near"; near.textContent = T.near;
    var zipw = document.createElement("span"); zipw.className = "zipw";
    var zip = document.createElement("input"); zip.className = "zip"; zip.placeholder = T.zip;
    zip.inputMode = "numeric"; zip.maxLength = 5; zip.autocomplete = "postal-code";
    var zgo = document.createElement("button"); zgo.className = "zgo"; zgo.textContent = T.go;
    zipw.appendChild(zip); zipw.appendChild(zgo);
    row.appendChild(near); row.appendChild(zipw); p.appendChild(row);
    var err = document.createElement("p"); err.className = "err";
    var list = document.createElement("div"); p.appendChild(list); p.appendChild(err);
    var skip = document.createElement("button"); skip.className = "skip"; skip.textContent = T.skip;
    p.appendChild(skip);

    function close() { ov.remove(); }
    function choose(k) {
      save(k.slug, k.region);
      close();
      if (k.api) location.href = BASE + "order?k=" + k.slug;
      /* non-orderable kitchen: stay on the site, choice remembered */
    }
    function renderList(pos) {
      list.innerHTML = "";
      var arr = KITCHENS.slice();
      if (pos) {
        arr.forEach(function (k) { k._d = haversine(pos.lat, pos.lng, k.lat, k.lng); });
        arr.sort(function (a, b) { return a._d - b._d; });
      }
      arr.forEach(function (k) {
        var b = document.createElement("button"); b.className = "k"; b.type = "button";
        var w = document.createElement("span");
        var bb = document.createElement("b"); bb.textContent = k.name; w.appendChild(bb);
        var sm = document.createElement("small");
        sm.textContent = k.area[lang()] + (k.api ? "" : " · " + STR[lang()].phoneOnly);
        w.appendChild(sm); b.appendChild(w);
        if (k._d != null) {
          var d = document.createElement("span"); d.className = "d";
          d.textContent = lang() === "zh" ? (k._d * 1.609).toFixed(1) + " 公里" : k._d.toFixed(1) + " mi";
          b.appendChild(d);
        }
        b.onclick = function () { choose(k); };
        list.appendChild(b);
      });
    }
    near.onclick = function () {
      if (!navigator.geolocation) return;
      near.textContent = T.locating; near.disabled = true;
      navigator.geolocation.getCurrentPosition(function (po) {
        near.textContent = T.near; near.disabled = false;
        renderList({ lat: po.coords.latitude, lng: po.coords.longitude });
      }, function () { near.textContent = T.near; near.disabled = false; }, { timeout: 8000 });
    };
    function zipGo() {
      var r = regionByZip(zip.value.trim());
      err.textContent = "";
      if (!r) { err.textContent = T.noZip; return; }
      if (r.kitchen) { choose(r.kitchen); return; }
      /* region known: reorder list, preselect first orderable */
      var arr = KITCHENS.filter(function (k) { return k.region === r.region; })
        .concat(KITCHENS.filter(function (k) { return k.region !== r.region; }));
      list.innerHTML = "";
      arr.forEach(function (k) {
        var b = document.createElement("button"); b.className = "k"; b.type = "button";
        var w = document.createElement("span");
        var bb = document.createElement("b"); bb.textContent = k.name; w.appendChild(bb);
        var sm = document.createElement("small");
        sm.textContent = k.area[lang()] + (k.api ? "" : " · " + STR[lang()].phoneOnly);
        w.appendChild(sm); b.appendChild(w);
        b.onclick = function () { choose(k); };
        list.appendChild(b);
      });
    }
    zgo.onclick = zipGo;
    zip.addEventListener("keydown", function (e) { if (e.key === "Enter") zipGo(); });
    skip.onclick = function () {
      try { sessionStorage.setItem("lx_gate_skip", "1"); } catch (e) {}
      close();
    };
    ov.addEventListener("click", function (e) { if (e.target === ov) skip.onclick(); });
    renderList(null);
    document.body.appendChild(ov);
  }

  function boot() {
    rewrite();
    setTimeout(rewrite, 1500); /* late client re-renders */
    var skipped = false;
    try { skipped = sessionStorage.getItem("lx_gate_skip") === "1"; } catch (e) {}
    if (!savedKitchen() && !skipped) setTimeout(showGate, 600);
  }
  if (document.readyState === "complete") setTimeout(boot, 300);
  else window.addEventListener("load", function () { setTimeout(boot, 300); });
})();
