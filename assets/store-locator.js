/* Wood Reformer store locator
   Leaflet + OpenStreetMap (geen API-sleutel nodig). Zoeken via Nominatim. */
(function () {
  'use strict';

  var GEO_URL = 'https://nominatim.openstreetmap.org/search';
  var CACHE_KEY = 'wr-geocode-v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toRad(d) { return d * Math.PI / 180; }
  function distanceKm(a, b) {
    var R = 6371, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } }
  function writeCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {} }

  function geocode(query, countries) {
    var cache = readCache(), key = query.toLowerCase().trim();
    if (cache[key]) return Promise.resolve(cache[key]);
    var url = GEO_URL + '?format=json&limit=1&q=' + encodeURIComponent(query) +
      (countries ? '&countrycodes=' + encodeURIComponent(countries) : '');
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.length) return null;
        var p = { lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon) };
        cache[key] = p; writeCache(cache);
        return p;
      })
      .catch(function () { return null; });
  }

  function Locator(root) {
    var cfg = JSON.parse(root.querySelector('[data-wr-config]').textContent);
    this.root = root;
    this.cfg = cfg;
    this.studios = (cfg.studios || []).map(function (s, i) {
      s.id = i;
      s.types = (s.types || []).map(function (t) { return String(t).trim(); }).filter(Boolean);
      s.lat = parseFloat(s.lat); s.lng = parseFloat(s.lng);
      if (isNaN(s.lat) || isNaN(s.lng)) { s.lat = null; s.lng = null; }
      return s;
    });
    this.origin = null;
    this.activeId = null;
    this.filter = null;
    this.markers = {};
    this.$ = function (sel) { return root.querySelector(sel); };
    this.initMap();
    this.bind();
    this.render();
    this.geocodeMissing();
  }

  Locator.prototype.initMap = function () {
    var cfg = this.cfg;
    this.map = L.map(this.$('[data-wr-map]'), { scrollWheelZoom: false, zoomControl: true })
      .setView([cfg.centerLat || 50.85, cfg.centerLng || 4.35], cfg.zoom || 7);
    // CARTO "light" tegels: rustig zwart-wit kaartbeeld dat bij het thema past
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
    }).addTo(this.map);
    // scrollen op de kaart pas na een klik, zodat de pagina niet "vastzit"
    var map = this.map;
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });
    this.markerLayer = L.layerGroup().addTo(this.map);
  };

  Locator.prototype.bind = function () {
    var self = this, form = this.$('[data-wr-form]');
    var filters = this.$('[data-wr-filters]');
    if (filters) filters.addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (!b) return;
      self.filter = b.getAttribute('data-type') || null;
      if (self.activeId != null && self.studios[self.activeId] && self.filter &&
          self.studios[self.activeId].types.indexOf(self.filter) === -1) self.activeId = null;
      self.render();
      if (self.origin) {
        var near = self.sorted().filter(function (s) { return s.lat != null; }).slice(0, 3);
        self.map.fitBounds([[self.origin.lat, self.origin.lng]].concat(near.map(function (s) { return [s.lat, s.lng]; })), { padding: [60, 60], maxZoom: 12 });
      } else self.fitAll();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = self.$('[data-wr-input]').value.trim();
      if (!q) return self.clearOrigin();
      self.status('Zoeken…');
      geocode(q, self.cfg.countries).then(function (p) {
        if (!p) return self.status('Locatie niet gevonden. Probeer een postcode of stad.');
        self.setOrigin(p, 'Resultaten rond “' + q + '”');
      });
    });
    this.$('[data-wr-locate]').addEventListener('click', function () {
      if (!navigator.geolocation) return self.status('Locatiebepaling wordt niet ondersteund.');
      self.status('Uw locatie bepalen…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        self.setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Studio’s bij uw huidige locatie');
      }, function () { self.status('Geen toegang tot uw locatie. Voer een postcode of stad in.'); },
      { timeout: 10000 });
    });
    this.$('[data-wr-list]').addEventListener('click', function (e) {
      var li = e.target.closest('[data-id]');
      if (!li || e.target.closest('a')) return;
      self.select(parseInt(li.getAttribute('data-id'), 10), true);
    });
  };

  Locator.prototype.status = function (msg) { this.$('[data-wr-status]').textContent = msg || ''; };

  Locator.prototype.setOrigin = function (p, msg) {
    this.origin = p;
    if (this.meMarker) this.map.removeLayer(this.meMarker);
    this.meMarker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: '<div class="wr-pin wr-pin--me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false
    }).addTo(this.map);
    this.status(msg);
    this.render();
    var near = this.sorted().filter(function (s) { return s.lat != null; }).slice(0, 3);
    var pts = [[p.lat, p.lng]].concat(near.map(function (s) { return [s.lat, s.lng]; }));
    this.map.fitBounds(pts, { padding: [60, 60], maxZoom: 12 });
    if (near[0]) this.select(near[0].id, false);
  };

  Locator.prototype.clearOrigin = function () {
    this.origin = null;
    if (this.meMarker) { this.map.removeLayer(this.meMarker); this.meMarker = null; }
    this.status('');
    this.render();
    this.fitAll();
  };

  Locator.prototype.visible = function () {
    var f = this.filter;
    return this.studios.filter(function (s) { return !f || s.types.indexOf(f) !== -1; });
  };

  Locator.prototype.allTypes = function () {
    var seen = {};
    this.studios.forEach(function (s) { s.types.forEach(function (t) { seen[t] = true; }); });
    return Object.keys(seen).sort();
  };

  Locator.prototype.renderFilters = function () {
    var box = this.$('[data-wr-filters]'), self = this, types = this.allTypes();
    if (!box) return;
    if (types.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    var all = [null].concat(types);
    box.innerHTML = '<span class="wr-locator__filter-label">Type reformer</span>' + all.map(function (t) {
      var on = (t === self.filter);
      return '<button type="button" class="wr-chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-type="' + esc(t || '') + '">' + esc(t || 'Alle') + '</button>';
    }).join('');
  };

  Locator.prototype.sorted = function () {
    var o = this.origin;
    var list = this.visible();
    list.forEach(function (s) { s.dist = (o && s.lat != null) ? distanceKm(o, s) : null; });
    list.sort(function (a, b) {
      if (o) {
        if (a.dist == null) return 1;
        if (b.dist == null) return -1;
        return a.dist - b.dist;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  };

  Locator.prototype.render = function () {
    var self = this, list = this.sorted();
    var ul = this.$('[data-wr-list]');
    this.renderFilters();
    this.$('[data-wr-count]').textContent = list.length + (list.length === 1 ? ' studio' : ' studio’s');
    if (!list.length) { ul.innerHTML = '<li class="wr-locator__empty">Geen studio’s gevonden voor deze selectie.</li>'; this.renderMarkers(); return; }
    ul.innerHTML = list.map(function (s) {
      var img = s.image
        ? '<img class="wr-studio__img" src="' + esc(s.image) + '" alt="' + esc(s.name) + '" loading="lazy" width="112" height="112">'
        : '<div class="wr-studio__img wr-studio__img--empty" aria-hidden="true">W</div>';
      var dist = s.dist != null ? '<div class="wr-studio__dist">' + (s.dist < 10 ? s.dist.toFixed(1) : Math.round(s.dist)) + ' km</div>' : '';
      var tags = s.types.length ? '<div class="wr-studio__types">' + s.types.map(function (t) { return '<span class="wr-tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '';
      var links = [];
      if (s.lat != null) links.push('<a href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '" target="_blank" rel="noopener">Route</a>');
      if (s.url) links.push('<a href="' + esc(s.url) + '" target="_blank" rel="noopener">Website</a>');
      if (s.phone) links.push('<a href="tel:' + esc(s.phone.replace(/\s/g, '')) + '">' + esc(s.phone) + '</a>');
      return '<li class="wr-studio' + (s.id === self.activeId ? ' is-active' : '') + '" data-id="' + s.id + '">' +
        img + '<div><h3 class="wr-studio__name">' + esc(s.name) + '</h3>' + dist +
        '<address class="wr-studio__addr">' + esc(s.address) + '</address>' + tags +
        '<div class="wr-studio__links">' + links.join('') + '</div></div></li>';
    }).join('');
    this.renderMarkers();
  };

  Locator.prototype.renderMarkers = function () {
    var self = this;
    this.markerLayer.clearLayers();
    this.markers = {};
    this.visible().forEach(function (s) {
      if (s.lat == null) return;
      var m = L.marker([s.lat, s.lng], {
        title: s.name,
        icon: L.divIcon({ className: '', html: '<div class="wr-pin' + (s.id === self.activeId ? ' is-active' : '') + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
      });
      m.bindPopup('<div class="wr-popup__name">' + esc(s.name) + '</div><div>' + esc(s.address) + '</div>');
      m.on('click', function () { self.select(s.id, false); });
      m.addTo(self.markerLayer);
      self.markers[s.id] = m;
    });
  };

  Locator.prototype.select = function (id, pan) {
    this.activeId = id;
    var s = this.studios[id];
    this.root.querySelectorAll('.wr-studio').forEach(function (el) {
      el.classList.toggle('is-active', parseInt(el.getAttribute('data-id'), 10) === id);
    });
    var active = this.$('.wr-studio.is-active');
    if (active) {
      var ul = this.$('[data-wr-list]');
      ul.scrollTo({ top: active.offsetTop - ul.offsetTop, behavior: 'smooth' });
    }
    this.renderMarkers();
    if (s && s.lat != null) {
      if (pan) this.map.flyTo([s.lat, s.lng], Math.max(this.map.getZoom(), 13), { duration: .6 });
      if (this.markers[id]) this.markers[id].openPopup();
    }
  };

  Locator.prototype.fitAll = function () {
    var pts = this.visible().filter(function (s) { return s.lat != null; }).map(function (s) { return [s.lat, s.lng]; });
    if (pts.length > 1) this.map.fitBounds(pts, { padding: [50, 50] });
    else if (pts.length === 1) this.map.setView(pts[0], 12);
  };

  // Studio's zonder coördinaten worden automatisch opgezocht (gecached in de browser)
  Locator.prototype.geocodeMissing = function () {
    var self = this, todo = this.studios.filter(function (s) { return s.lat == null && s.address; });
    this.fitAll();
    (function next() {
      var s = todo.shift();
      if (!s) return;
      var cached = readCache()[s.address.toLowerCase().trim()];
      geocode(s.address, null).then(function (p) {
        if (p) { s.lat = p.lat; s.lng = p.lng; self.render(); self.fitAll(); }
        setTimeout(next, cached ? 0 : 1100); // Nominatim: max 1 aanvraag/sec
      });
    })();
  };

  function boot() {
    document.querySelectorAll('.wr-locator[data-wr-locator]').forEach(function (el) {
      if (!el.__wr) el.__wr = new Locator(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
