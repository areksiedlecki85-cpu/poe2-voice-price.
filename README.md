# PoE2 Voice Price

Mobile PWA for voice-driven Path of Exile 2 trade searches and rough pricing from real, currently listed offers. Unofficial project; not endorsed by GGG.

## Run

Node.js 20+: `npm start`; browse `http://localhost:3000`. Deploy on Render with a Node web service (`npm start`, build `npm install --omit=dev`, free plan). Microphone requires browser with Web Speech API and HTTPS. Photo OCR uses Tesseract.js in the browser.

## Trade limitations

Trade catalog, search and item fetch access is best-effort, subject to GGG's throttling, protection and potential login requirements. The backend does not fake offers or invent valuations. Estimates require at least 3 divine-priced active listings; other currencies are not converted. 85% fallback relaxes numeric minimum values, not selected mods. Compare stats manually, especially for corrupted, anointed or rare multimod items. No historical sales are available.

## Security

No PoE session cookie required or stored. The app restricts its requests to the official PoE trade API and applies a local request rate limit. Free hosting may sleep while idle.
