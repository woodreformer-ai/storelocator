/* Wood Reformer store locator
   Kaart: Google Maps (als er een API-sleutel is ingesteld) of Leaflet + OpenStreetMap als terugval.
   Zoeken: Google Geocoding of Nominatim, afhankelijk van de kaart. */
(function () {
  'use strict';

  var GEO_URL = 'https://nominatim.openstreetmap.org/search';
  var CACHE_KEY = 'wr-geocode-v2';
  // rustig zwart-wit kaartbeeld dat bij het thema past
  var GOOGLE_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9c9c9' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dedede' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d6d6d6' }] }
  ];

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
  function popupHtml(s) {
    return '<div class="wr-popup"><div class="wr-popup__name">' + esc(s.name) + '</div><div>' + esc(s.address) + '</div></div>';
  }

  /* ---------- geocoding ---------- */
  var googleGeocoder = null;
  function geocodeGoogle(query) {
    return new Promise(function (resolve) {
      googleGeocoder = googleGeocoder || new google.maps.Geocoder();
      googleGeocoder.geocode({ address: query }, function (res, status) {
        if (status === 'OK' && res && res[0]) {
          var l = res[0].geometry.location;
          resolve({ lat: l.lat(), lng: l.lng() });
        } else resolve(null);
      });
    });
  }
  function geocodeNominatim(query, countries) {
    var url = GEO_URL + '?format=json&limit=1&q=' + encodeURIComponent(query) +
      (countries ? '&countrycodes=' + encodeURIComponent(countries) : '');
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) { return res && res.length ? { lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon) } : null; })
      .catch(function () { return null; });
  }
  function geocode(query, countries, useGoogle) {
    var cache = readCache(), key = (useGoogle ? 'g:' : 'n:') + query.toLowerCase().trim();
    if (cache[key]) return Promise.resolve(cache[key]);
    return (useGoogle ? geocodeGoogle(query) : geocodeNominatim(query, countries)).then(function (p) {
      if (p) { cache[key] = p; writeCache(cache); }
      return p;
    });
  }

  /* ---------- kaart-adapters: dezelfde methodes voor Google en Leaflet ---------- */
  function LeafletMap(el, cfg) {
    var self = this;
    this.map = L.map(el, { scrollWheelZoom: false })
      .setView([cfg.centerLat || 50.85, cfg.centerLng || 4.35], cfg.zoom || 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
    }).addTo(this.map);
    // scrollen op de kaart pas na een klik, zodat de pagina niet "vastzit"
    this.map.on('click', function () { self.map.scrollWheelZoom.enable(); });
    this.map.on('mouseout', function () { self.map.scrollWheelZoom.disable(); });
    this.layer = L.layerGroup().addTo(this.map);
    this.markers = {};
  }
  LeafletMap.prototype.fit = function (pts, maxZoom) {
    if (pts.length > 1) this.map.fitBounds(pts.map(function (p) { return [p.lat, p.lng]; }), { padding: [60, 60], maxZoom: maxZoom || 18 });
    else if (pts.length === 1) this.map.setView([pts[0].lat, pts[0].lng], Math.min(maxZoom || 12, 12));
  };
  LeafletMap.prototype.focus = function (p) { this.map.flyTo([p.lat, p.lng], Math.max(this.map.getZoom(), 13), { duration: .6 }); };
  LeafletMap.prototype.setMarkers = function (studios, activeId, onSelect) {
    var self = this;
    this.layer.clearLayers();
    this.markers = {};
    studios.forEach(function (s) {
      var m = L.marker([s.lat, s.lng], {
        title: s.name,
        icon: L.divIcon({ className: '', html: '<div class="wr-pin' + (s.id === activeId ? ' is-active' : '') + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
      });
      m.bindPopup(popupHtml(s));
      m.on('click', function () { onSelect(s.id); });
      m.addTo(self.layer);
      self.markers[s.id] = m;
    });
  };
  LeafletMap.prototype.openPopup = function (id) { if (this.markers[id]) this.markers[id].openPopup(); };
  LeafletMap.prototype.setOrigin = function (p) {
    this.clearOrigin();
    this.me = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: '<div class="wr-pin wr-pin--me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false
    }).addTo(this.map);
  };
  LeafletMap.prototype.clearOrigin = function () { if (this.me) { this.map.removeLayer(this.me); this.me = null; } };

  function GoogleMap(el, cfg) {
    this.map = new google.maps.Map(el, {
      center: { lat: parseFloat(cfg.centerLat) || 50.85, lng: parseFloat(cfg.centerLng) || 4.35 },
      zoom: cfg.zoom || 7,
      styles: GOOGLE_STYLE,
      gestureHandling: 'cooperative',   // pagina scrollt gewoon door; ctrl/twee vingers om te zoomen
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false
    });
    this.info = new google.maps.InfoWindow();
    this.markers = {};
    this.studios = {};
  }
  GoogleMap.prototype.icon = function (active) {
    return {
      path: 'M-7,-7 L7,-7 L7,7 L-7,7 Z',
      fillColor: active ? '#ffffff' : '#000000', fillOpacity: 1,
      strokeColor: active ? '#000000' : '#ffffff', strokeWeight: 2,
      scale: active ? 1.5 : 1
    };
  };
  GoogleMap.prototype.fit = function (pts, maxZoom) {
    var map = this.map;
    if (pts.length > 1) {
      var b = new google.maps.LatLngBounds();
      pts.forEach(function (p) { b.extend(p); });
      map.fitBounds(b, 60);
      if (maxZoom) google.maps.event.addListenerOnce(map, 'idle', function () { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
    } else if (pts.length === 1) { map.setCenter(pts[0]); map.setZoom(Math.min(maxZoom || 12, 12)); }
  };
  GoogleMap.prototype.focus = function (p) {
    this.map.panTo(p);
    if (this.map.getZoom() < 13) this.map.setZoom(13);
  };
  GoogleMap.prototype.setMarkers = function (studios, activeId, onSelect) {
    var self = this;
    Object.keys(this.markers).forEach(function (k) { self.markers[k].setMap(null); });
    this.markers = {}; this.studios = {};
    studios.forEach(function (s) {
      var m = new google.maps.Marker({
        map: self.map, position: { lat: s.lat, lng: s.lng }, title: s.name,
        icon: self.icon(s.id === activeId), zIndex: s.id === activeId ? 10 : 1
      });
      m.addListener('click', function () { onSelect(s.id); });
      self.markers[s.id] = m; self.studios[s.id] = s;
    });
  };
  GoogleMap.prototype.openPopup = function (id) {
    if (!this.markers[id]) return;
    this.info.setContent(popupHtml(this.studios[id]));
    this.info.open({ map: this.map, anchor: this.markers[id] });
  };
  GoogleMap.prototype.setOrigin = function (p) {
    this.clearOrigin();
    this.me = new google.maps.Marker({
      map: this.map, position: p, clickable: false,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#000000', strokeWeight: 4 }
    });
  };
  GoogleMap.prototype.clearOrigin = function () { if (this.me) { this.me.setMap(null); this.me = null; } };

  /* ---------- Google Maps script laden ---------- */
  var googleLoading = null, instance = null;
  function loadGoogle(key) {
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve();
    if (googleLoading) return googleLoading;
    googleLoading = new Promise(function (resolve, reject) {
      window.__wrGoogleReady = resolve;
      // ongeldige/beperkte sleutel: terugvallen op OpenStreetMap
      window.gm_authFailure = function () { if (instance) instance.useLeaflet(); reject(new Error('auth')); };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&callback=__wrGoogleReady&v=weekly';
      s.async = true;
      s.onerror = function () { reject(new Error('load')); };
      document.head.appendChild(s);
    });
    return googleLoading;
  }

  /* ---------- locator ---------- */
  function Locator(root) {
    var cfg = JSON.parse(root.querySelector('[data-wr-config]').textContent);
    var self = this;
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
    this.useGoogle = false;
    this.$ = function (sel) { return root.querySelector(sel); };
    instance = this;
    this.bind();
    this.render();
    var start = function (google) {
      self.useGoogle = google;
      self.mapEl = self.$('[data-wr-map]');
      self.map = google ? new GoogleMap(self.mapEl, cfg) : new LeafletMap(self.mapEl, cfg);
      self.render();
      self.fitAll();
      self.geocodeMissing();
    };
    if (cfg.googleKey) {
      loadGoogle(cfg.googleKey).then(function () { start(true); }, function () { if (!self.map) start(false); });
    } else start(false);
  }

  Locator.prototype.useLeaflet = function () {
    if (!this.useGoogle || !window.L) return;
    var el = this.mapEl, fresh = el.cloneNode(false);
    el.parentNode.replaceChild(fresh, el);
    this.mapEl = fresh;
    this.useGoogle = false;
    this.map = new LeafletMap(fresh, this.cfg);
    this.render();
    this.fitAll();
  };

  Locator.prototype.bind = function () {
    var self = this, form = this.$('[data-wr-form]');
    var filters = this.$('[data-wr-filters]');
    if (filters) filters.addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (!b) return;
      self.filter = b.getAttribute('data-type') || null;
      var a = self.studios[self.activeId];
      if (a && self.filter && a.types.indexOf(self.filter) === -1) self.activeId = null;
      self.render();
      self.refit();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = self.$('[data-wr-input]').value.trim();
      if (!q) return self.clearOrigin();
      self.status('Zoeken…');
      geocode(q, self.cfg.countries, self.useGoogle).then(function (p) {
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

  Locator.prototype.located = function () { return this.sorted().filter(function (s) { return s.lat != null; }); };

  // zoom naar de zoekplek + 3 dichtstbijzijnde, of anders naar alle zichtbare studio's
  Locator.prototype.refit = function () {
    if (!this.map) return;
    if (this.origin) {
      var near = this.located().slice(0, 3);
      this.map.fit([this.origin].concat(near.map(function (s) { return { lat: s.lat, lng: s.lng }; })), 12);
    } else this.fitAll();
  };

  Locator.prototype.setOrigin = function (p, msg) {
    this.origin = p;
    if (this.map) this.map.setOrigin(p);
    this.status(msg);
    this.render();
    this.refit();
    var first = this.located()[0];
    if (first) this.select(first.id, false);
  };

  Locator.prototype.clearOrigin = function () {
    this.origin = null;
    if (this.map) this.map.clearOrigin();
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
    box.innerHTML = '<span class="wr-locator__filter-label">Type reformer</span>' + [null].concat(types).map(function (t) {
      var on = (t === self.filter);
      return '<button type="button" class="wr-chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-type="' + esc(t || '') + '">' + esc(t || 'Alle') + '</button>';
    }).join('');
  };

  Locator.prototype.sorted = function () {
    var o = this.origin, list = this.visible();
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
    var self = this, list = this.sorted(), ul = this.$('[data-wr-list]');
    this.renderFilters();
    this.$('[data-wr-count]').textContent = list.length + (list.length === 1 ? ' studio' : ' studio’s');
    if (!list.length) {
      ul.innerHTML = '<li class="wr-locator__empty">Geen studio’s gevonden voor deze selectie.</li>';
    } else {
      ul.innerHTML = list.map(function (s) {
        var img = s.image
          ? '<img class="wr-studio__img" src="' + esc(s.image) + '" alt="' + esc(s.name) + '" loading="lazy" width="112" height="112">'
          : '<div class="wr-studio__img wr-studio__img--empty" aria-hidden="true">W</div>';
        var dist = s.dist != null ? '<div class="wr-studio__dist">' + (s.dist < 10 ? s.dist.toFixed(1) : Math.round(s.dist)) + ' km</div>' : '';
        var tags = s.types.length ? '<div class="wr-studio__types">' + s.types.map(function (t) { return '<span class="wr-tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '';
        var links = ['<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.name + ', ' + s.address) + '" target="_blank" rel="noopener">Route</a>'];
        if (s.url) links.push('<a href="' + esc(s.url) + '" target="_blank" rel="noopener">Website</a>');
        if (s.phone) links.push('<a href="tel:' + esc(s.phone.replace(/\s/g, '')) + '">' + esc(s.phone) + '</a>');
        return '<li class="wr-studio' + (s.id === self.activeId ? ' is-active' : '') + '" data-id="' + s.id + '">' +
          img + '<div><h3 class="wr-studio__name">' + esc(s.name) + '</h3>' + dist +
          '<address class="wr-studio__addr">' + esc(s.address) + '</address>' + tags +
          '<div class="wr-studio__links">' + links.join('') + '</div></div></li>';
      }).join('');
    }
    this.renderMarkers();
  };

  Locator.prototype.renderMarkers = function () {
    if (!this.map) return;
    var self = this;
    this.map.setMarkers(this.visible().filter(function (s) { return s.lat != null; }), this.activeId,
      function (id) { self.select(id, false); });
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
    if (this.map && s && s.lat != null) {
      if (pan) this.map.focus({ lat: s.lat, lng: s.lng });
      this.map.openPopup(id);
    }
  };

  Locator.prototype.fitAll = function () {
    if (!this.map) return;
    this.map.fit(this.visible().filter(function (s) { return s.lat != null; })
      .map(function (s) { return { lat: s.lat, lng: s.lng }; }));
  };

  // Studio's zonder coördinaten worden automatisch opgezocht (gecached in de browser)
  Locator.prototype.geocodeMissing = function () {
    var self = this, todo = this.studios.filter(function (s) { return s.lat == null && s.address; });
    (function next() {
      var s = todo.shift();
      if (!s) return;
      var g = self.useGoogle;
      geocode(s.address, null, g).then(function (p) {
        if (p) { s.lat = p.lat; s.lng = p.lng; self.render(); self.fitAll(); }
        setTimeout(next, g ? 100 : 1100); // Nominatim: max 1 aanvraag/sec
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
