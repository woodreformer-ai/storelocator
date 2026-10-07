# Wood Reformer store locator

Shopify-sectie (thema **Atelier**) met studiolijst links en kaart rechts.
Stijl: Newsreader + Inter, zwart/wit, geen afgeronde hoeken, hoofdletterknoppen.
Kaart: Leaflet + OpenStreetMap/CARTO (geen API-sleutel). Zoeken: Nominatim.

## Installeren
1. Shopify admin → Online Store → Themes → ⋯ → **Edit code**.
2. `sections/store-locator.liquid` → map *Sections*; `assets/store-locator.css` en `assets/store-locator.js` → map *Assets*.
3. Theme editor → pagina **b2b** → *Add section* → **Store locator**.
4. Voeg per studio een blok **Studio** toe: naam, adres, type reformer (komma-gescheiden), foto, optioneel coördinaten/website/telefoon.

## Gedrag
- Klant typt postcode/stad of klikt *Gebruik mijn locatie* → lijst sorteert op afstand (km).
- Klik op studio of marker → kaart zoomt en highlight; *Route* opent Google Maps.
- Zonder coördinaten wordt het adres automatisch opgezocht (gecached in browser); vul lat/lng in voor snelheid.

`demo/index.html` toont het geheel lokaal met voorbeelddata.
