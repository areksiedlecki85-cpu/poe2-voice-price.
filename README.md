# PoE2 Voice Price

Mobile PWA for voice-driven Path of Exile 2 trade searches and rough pricing from real, currently listed offers. Unofficial project; not endorsed by GGG.

## Run

Node.js 20+: `npm start`; browse `http://localhost:3000`. Deploy on Render with a Node web service (`npm start`, build `npm install --omit=dev`, free plan). Microphone requires browser with Web Speech API and HTTPS. Photo OCR uses Tesseract.js in the browser.

## Trade limitations

Trade catalog, search and item fetch access is best-effort, subject to GGG's throttling, protection and potential login requirements. The backend does not fake offers or invent valuations. Estimates require at least 3 divine-priced active listings; other currencies are not converted. 85% fallback relaxes numeric minimum values, not selected mods. Compare stats manually, especially for corrupted, anointed or rare multimod items. No historical sales are available.

## Security

No PoE session cookie required or stored. The app restricts its requests to the official PoE trade API and applies a local request rate limit. Free hosting may sleep while idle.

## Market Hunter (MVP)

Open `/hunter.html` from the main app. Defaults: Forbidden Rites, **50–200 divine**, **35% discount**, all documented unique-item categories.

- **Live documented source**: poe.ninja PoE2 economy overview (one-hour shared cache, ETag, conservative rate limiting and 429 backoff).
- Compare a manually observed asking price to the reference price; at least 5 reference listings are required for a tentative opportunity status.
- Save a local browser watchlist. The alert concerns a **fall in the reference value**, not arrival of an individual listing.
- **Not implemented**: automatic scans of individual seller listings, background notifications, rare-item auction pricing or automatic purchases. Do not label reference values as active auctions.

See [the Market Hunter specification](docs/market-hunter.md). Run tests with `npm test`.
