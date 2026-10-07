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
- Filter op type reformer (knoppen verschijnen automatisch zodra er meer dan één type is).
- Klik op studio of marker → kaart zoomt en highlight; *Route* opent Google Maps.
- Zonder coördinaten wordt het adres automatisch opgezocht (gecached in browser); vul lat/lng in voor snelheid.

`demo/index.html` toont het geheel lokaal met voorbeelddata.

## Studio's importeren
`data/studios.json` bevat de 32 studio's uit het tabblad *Studios* van `Inventory & Sales 2026-4.xlsx`.
`templates/page.store-locator.json` is een kant-en-klaar pagina-template met de sectie en alle 32 studio-blokken:
1. Theme → Edit code → map *Templates* → *Add a new template* (type *page*, naam `store-locator`) en plak de inhoud.
2. Wijs dit template toe aan de pagina (of kopieer de `sections`-entry naar het b2b-template).
3. Foto's voeg je daarna per studio-blok toe via *Foto studio*.

Let op: de coördinaten in de data zijn indicatief (dorp/stad). Zonder exacte positie staat de marker enkele honderden meters naast de studio; de routeknop gebruikt wel het volledige adres.

## Google Maps (optioneel)
Vul in de sectie-instellingen **Google Maps API-sleutel** in om een Google Maps-kaart (in zwart-wit stijl) en de Google-adreszoeker te gebruiken.
1. Google Cloud Console → project aanmaken → facturatie koppelen → *Maps JavaScript API* en *Geocoding API* inschakelen.
2. API-sleutel maken en beperken tot *HTTP referrers*: `woodreformer.com/*` en `*.myshopify.com/*`.
3. Sleutel plakken in de sectie. Is de sleutel leeg of ongeldig, dan valt de locator terug op OpenStreetMap.

In `demo/index.html` (lokaal openen in de browser) zie je de OpenStreetMap-kaart met echte kaartbeelden.
