/* =========================================================================
   GalaxyTrader site script (no frameworks, no build step).

   Features:
     - Reorder list saved in the browser (localStorage), sent by WhatsApp/email
     - Instant search (MiniSearch, loaded only when the search box is used)
     - Category filters by machine brand / model / stock
     - "Find parts for your machine" picker on the home page
     - Recently viewed parts, quantity steppers, share button
     - Counts WhatsApp clicks through /api/click (a Cloudflare Pages Function)

   Every feature checks that its elements exist, so one file serves all pages.
   ========================================================================= */
(function () {
  "use strict";

  var html = document.documentElement;
  var ROOT = html.dataset.root || "/";
  var RELATIVE = html.dataset.relative === "true";
  var WA = html.dataset.wa;
  var SITE = html.dataset.site || "GalaxyTrader";
  var BASE = html.dataset.base || "";
  var EMAIL = html.dataset.email || "";
  var LIST_KEY = "gt-reorder-list-v1";
  var RECENT_KEY = "gt-recent-v1";

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  /** Turn a site path like "/p/gt-10021/" into a working link for this page. */
  function link(path) {
    if (!path || /^https?:/.test(path)) return path;
    var parts = path.split("?");
    var p = parts[0].replace(/^\//, "");
    if (RELATIVE && (p === "" || p.slice(-1) === "/")) p += "index.html";
    return ROOT + p + (parts[1] ? "?" + parts[1] : "");
  }

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Safe localStorage read/write (private mode or blocked storage won't crash the page). */
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  function toast(message) {
    var t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /** Normalise a SKU the same way build.py does: capitals, no dashes, O -> 0. */
  function skuNorm(text) {
    return String(text).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  }

  /** HTML for one product card (same markup as templates/_macros.html). */
  function cardHtml(item) {
    var tag = "";
    if (item.status === "discontinued") tag = '<span class="tag tag-gray">Discontinued</span>';
    else if (item.inStock === false) tag = '<span class="tag tag-warn">Ask for stock</span>';
    var btn = item.status === "discontinued" ? "" :
      '<button type="button" class="btn btn-small btn-outline" data-add-to-list data-sku="' + esc(item.sku) +
      '" data-name="' + esc(item.name) + '" data-url="' + esc(item.url) + '" data-moq="' + esc(item.moq || 1) + '">+ Reorder list</button>';
    return '<article class="card"><a class="card-img" href="' + esc(link(item.url)) + '">' +
      '<img src="' + esc(link(item.thumb)) + '" alt="' + esc(item.name) + " (" + esc(item.sku) + ')" width="300" height="300" loading="lazy">' +
      tag + '</a><div class="card-body"><span class="sku">' + esc(item.sku) + '</span><h3><a href="' + esc(link(item.url)) + '">' +
      esc(item.name) + "</a></h3>" + (item.fits ? '<p class="fits">Fits ' + esc(item.fits) + "</p>" : "") + btn + "</div></article>";
  }

  // ---------------------------------------------------------------------
  // Reorder list (saved in the browser)
  // ---------------------------------------------------------------------
  function getList() { return load(LIST_KEY, []); }
  function setList(list) { save(LIST_KEY, list); updateCount(); }

  function updateCount() {
    var n = getList().length;
    $all("[data-list-count]").forEach(function (b) { b.textContent = n; });
    $all("[data-add-to-list]").forEach(function (b) {
      var inList = getList().some(function (i) { return i.sku === b.dataset.sku; });
      if (!b.hasAttribute("data-from-qty")) {
        b.classList.toggle("added", inList);
        b.textContent = inList ? "✓ In your list" : "+ Reorder list";
      }
    });
  }

  function addToList(btn) {
    var list = getList();
    var qty = parseInt(btn.dataset.moq, 10) || 1;
    if (btn.hasAttribute("data-from-qty")) {
      var q = $("[data-qty]");
      qty = Math.max(parseInt(q && q.value, 10) || qty, 1);
    }
    var existing = list.filter(function (i) { return i.sku === btn.dataset.sku; })[0];
    if (existing) {
      existing.qty = btn.hasAttribute("data-from-qty") ? qty : existing.qty;
    } else {
      list.push({ sku: btn.dataset.sku, name: btn.dataset.name, url: btn.dataset.url, qty: qty });
    }
    setList(list);
    toast(btn.dataset.sku + " saved to your reorder list (" + qty + ")");
  }

  document.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add-to-list]");
    if (add) { addToList(add); return; }

    var wa = e.target.closest("[data-wa-click]");
    if (wa && !RELATIVE) {
      // Count the click; never block the visitor if logging fails.
      var body = JSON.stringify({ sku: wa.dataset.sku || "", src: wa.dataset.waClick });
      try { navigator.sendBeacon(ROOT + "api/click", new Blob([body], { type: "application/json" })); } catch (err) { /* ignore */ }
    }
  });

  // ---------------------------------------------------------------------
  // Product page: quantity stepper, share, recently viewed
  // ---------------------------------------------------------------------
  function initProduct() {
    var qty = $("[data-qty]");
    $all("[data-qty-step]").forEach(function (b) {
      b.addEventListener("click", function () {
        var min = parseInt(qty.min, 10) || 1;
        qty.value = Math.max(min, (parseInt(qty.value, 10) || min) + parseInt(b.dataset.qtyStep, 10));
      });
    });

    var share = $("[data-share]");
    if (share) {
      share.addEventListener("click", function () {
        var url = location.href;
        if (navigator.share) {
          navigator.share({ title: share.dataset.title, url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () { toast("Link copied"); });
        }
      });
    }

    var prod = $("[data-product]");
    if (prod) {
      var recent = load(RECENT_KEY, []).filter(function (r) { return r.sku !== prod.dataset.sku; });
      recent.unshift({ sku: prod.dataset.sku, name: prod.dataset.name, url: prod.dataset.url, thumb: prod.dataset.thumb });
      save(RECENT_KEY, recent.slice(0, 10));
    }
  }

  function initRecent() {
    var box = $("[data-recent]");
    if (!box) return;
    var recent = load(RECENT_KEY, []);
    if (!recent.length) return;
    $("[data-recent-list]").innerHTML = recent.map(function (r) {
      return '<a href="' + esc(link(r.url)) + '"><img src="' + esc(link(r.thumb)) + '" alt="" width="150" height="150" loading="lazy">' +
        "<span><b>" + esc(r.sku) + "</b><br>" + esc(r.name) + "</span></a>";
    }).join("");
    box.hidden = false;
  }

  // ---------------------------------------------------------------------
  // Reorder list page
  // ---------------------------------------------------------------------
  function initListPage() {
    var body = $("[data-list-body]");
    if (!body) return;
    var note = $("[data-list-note]");

    function message() {
      var lines = ["Hi " + SITE + ", please confirm availability and rates for:"];
      getList().forEach(function (i, n) {
        lines.push((n + 1) + ". " + i.sku + " - " + i.name + " x " + i.qty);
      });
      if (note.value.trim()) lines.push("", "Note: " + note.value.trim());
      return lines.join("\n");
    }

    function render() {
      var list = getList();
      $("[data-list-empty]").hidden = list.length > 0;
      $("[data-list-wrap]").hidden = list.length === 0;
      body.innerHTML = list.map(function (i, n) {
        return "<tr><td><a href=\"" + esc(link(i.url)) + "\"><b class=\"sku\">" + esc(i.sku) + "</b><br>" + esc(i.name) + "</a></td>" +
          '<td><label class="sr-only" for="lq' + n + '">Quantity for ' + esc(i.sku) + "</label>" +
          '<input id="lq' + n + '" type="number" inputmode="numeric" min="1" value="' + esc(i.qty) + '" data-idx="' + n + '"></td>' +
          '<td><button type="button" class="remove" data-remove="' + n + '" aria-label="Remove ' + esc(i.sku) + '">Remove</button></td></tr>';
      }).join("");
      refreshLinks();
    }

    function refreshLinks() {
      var text = message();
      $("[data-list-wa]").href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
      $("[data-list-email]").href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Reorder list") +
        "&body=" + encodeURIComponent(text);
    }

    body.addEventListener("change", function (e) {
      if (!e.target.dataset.idx) return;
      var list = getList();
      list[+e.target.dataset.idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      setList(list);
      refreshLinks();
    });
    body.addEventListener("click", function (e) {
      var b = e.target.closest("[data-remove]");
      if (!b) return;
      var list = getList();
      list.splice(+b.dataset.remove, 1);
      setList(list);
      render();
    });
    note.addEventListener("input", refreshLinks);
    $("[data-list-clear]").addEventListener("click", function () {
      if (window.confirm("Remove all parts from your list?")) { setList([]); render(); }
    });
    render();
  }

  // ---------------------------------------------------------------------
  // Home page machine picker
  // ---------------------------------------------------------------------
  function initPicker() {
    var form = $("[data-machine-picker]");
    if (!form) return;
    var data = JSON.parse($("#machine-data").textContent);
    var brand = $("[data-pick-brand]"), model = $("[data-pick-model]"), go = $("[data-pick-go]");
    brand.addEventListener("change", function () {
      var ms = data[brand.value] || [];
      model.innerHTML = '<option value="">Choose a model</option>' + ms.map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.model) + " (" + m.count + " parts)</option>";
      }).join("");
      model.disabled = !ms.length;
      go.disabled = true;
    });
    model.addEventListener("change", function () { go.disabled = !model.value; });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (model.value) location.href = link("/m/" + model.value + "/");
    });
  }

  // ---------------------------------------------------------------------
  // Category filters (brand -> model -> stock), drawn in the browser
  // ---------------------------------------------------------------------
  function initFilters() {
    var form = $("[data-filters]");
    if (!form) return;
    var machinesByBrand = JSON.parse(form.dataset.filterMachines);
    var brand = $("[data-f-brand]"), machine = $("[data-f-machine]"), stock = $("[data-f-stock]");
    var grid = $("[data-grid]"), count = $("[data-f-count]"), pager = $("[data-pager]"), moreWrap = $("[data-more-wrap]");
    var originalGrid = grid.innerHTML, originalCount = count.textContent;
    var items = null, shown = 0, matches = [];
    var PAGE = 48;

    function fillModels() {
      var ms = machinesByBrand[brand.value] || [];
      machine.innerHTML = '<option value="">All models</option>' + ms.map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.model) + "</option>";
      }).join("");
    }

    function drawMore() {
      grid.insertAdjacentHTML("beforeend", matches.slice(shown, shown + PAGE).map(cardHtml).join(""));
      shown += PAGE;
      moreWrap.innerHTML = shown < matches.length ?
        '<div class="more"><button type="button" class="btn btn-outline btn-big">Show more (' + (matches.length - shown) + ")</button></div>" : "";
      updateCount();
    }

    function apply() {
      var active = brand.value || machine.value || stock.checked;
      if (!active) {
        grid.innerHTML = originalGrid; count.textContent = originalCount; moreWrap.innerHTML = "";
        if (pager) pager.hidden = false;
        updateCount();
        return;
      }
      matches = items.filter(function (i) {
        if (brand.value && i.brands.indexOf(brand.value) < 0) return false;
        if (machine.value && i.machines.indexOf(machine.value) < 0) return false;
        if (stock.checked && (!i.inStock || i.status === "discontinued")) return false;
        return true;
      });
      grid.innerHTML = ""; shown = 0;
      count.textContent = matches.length + (matches.length === 1 ? " part" : " parts");
      if (pager) pager.hidden = true;
      drawMore();
    }

    function onChange() {
      if (items) { apply(); return; }
      count.textContent = "Loading…";
      fetch(form.dataset.src).then(function (r) { return r.json(); }).then(function (d) { items = d; apply(); })
        .catch(function () { count.textContent = "Filters couldn't load. Please refresh the page."; });
    }

    brand.addEventListener("change", function () { fillModels(); onChange(); });
    machine.addEventListener("change", onChange);
    stock.addEventListener("change", onChange);
    moreWrap.addEventListener("click", function (e) { if (e.target.closest("button")) drawMore(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------------------
  // Search (MiniSearch + one JSON index, loaded on first use)
  // ---------------------------------------------------------------------
  var searchReady = null;

  function loadSearch() {
    if (searchReady) return searchReady;
    searchReady = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = ROOT + "js/vendor/minisearch-7.1.2.js";
      s.onload = function () {
        fetch(ROOT + "data/search-index.json").then(function (r) { return r.json(); }).then(function (docs) {
          var ms = new window.MiniSearch({
            fields: ["sku", "skuNorm", "name", "aliases", "machines", "category"],
            storeFields: ["sku", "name", "url", "thumb", "fits", "status"],
            searchOptions: { boost: { sku: 4, skuNorm: 4, name: 2, machines: 1.5 }, prefix: true, fuzzy: 0.2 }
          });
          ms.addAll(docs);
          resolve(ms);
        }).catch(reject);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return searchReady;
  }

  /** Search the words AND the normalised SKU, then merge the two result lists. */
  function runSearch(ms, q) {
    var seen = {}, out = [];
    var a = ms.search(q);
    var norm = skuNorm(q);
    var b = norm.length >= 3 ? ms.search(norm, { fields: ["skuNorm"], prefix: true, fuzzy: false }) : [];
    b.concat(a).sort(function (x, y) { return y.score - x.score; }).forEach(function (r) {
      if (!seen[r.id]) { seen[r.id] = 1; out.push(r); }
    });
    return out;
  }

  function initHeaderSearch() {
    var input = $("[data-search-input]"), box = $("[data-search-results]");
    if (!input) return;
    var timer;
    input.addEventListener("focus", function () { loadSearch().catch(function () {}); });
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      timer = setTimeout(function () {
        loadSearch().then(function (ms) {
          var res = runSearch(ms, q).slice(0, 6);
          box.innerHTML = (res.length ? res.map(function (r) {
            return '<a class="sr-item" href="' + esc(link(r.url)) + '"><img src="' + esc(link(r.thumb)) + '" alt="" width="48" height="48">' +
              "<span><strong>" + esc(r.name) + "</strong><small>" + esc(r.sku) + (r.fits ? " · fits " + esc(r.fits) : "") + "</small></span></a>";
          }).join("") : '<div class="sr-none">No parts found. Try another spelling or the machine model.</div>') +
            '<a class="sr-all" href="' + esc(link("/search/?q=" + encodeURIComponent(q))) + '">See all results for “' + esc(q) + "”</a>";
          box.hidden = false;
        });
      }, 120);
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".search")) box.hidden = true; });
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") box.hidden = true; });
  }

  function initSearchPage() {
    var grid = $("[data-search-grid]");
    if (!grid) return;
    var q = new URLSearchParams(location.search).get("q") || "";
    var input = $("[data-search-page-input]");
    input.value = q;
    if (!q.trim()) return;
    $("[data-search-title]").textContent = "Results for “" + q + "”";
    document.title = "Search: " + q + " | " + SITE;
    $("[data-search-count]").textContent = "Searching…";
    loadSearch().then(function (ms) {
      var res = runSearch(ms, q.trim());
      $("[data-search-count]").textContent = res.length + (res.length === 1 ? " part" : " parts") + " found";
      $("[data-search-empty]").hidden = res.length > 0;
      grid.innerHTML = res.slice(0, 120).map(cardHtml).join("");
      updateCount();
    }).catch(function () { $("[data-search-count]").textContent = "Search couldn't load. Please refresh the page."; });
  }

  // ---------------------------------------------------------------------
  initProduct();
  initRecent();
  initListPage();
  initPicker();
  initFilters();
  initHeaderSearch();
  initSearchPage();
  updateCount();
})();
