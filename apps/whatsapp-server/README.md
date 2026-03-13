# WhatsApp Server — BaleShop GH

A lightweight Express server that wraps `whatsapp-web.js` to send WhatsApp messages to customers.

## Setup

```bash
cd apps/whatsapp-server
npm install
npm start
```

On first run the server generates a QR code. Open the BaleShop GH app, go to
**Customers → Send Message**, and the QR will appear in the UI. Scan it with
the WhatsApp account you want to send from (the shop's phone).

Once scanned the session is saved locally in `.wwebjs_auth/` — you won't need
to scan again unless you log out or delete that folder.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |

If you change the port, also update `VITE_WHATSAPP_SERVER_URL` in
`apps/frontend/.env`:

```env
VITE_WHATSAPP_SERVER_URL=http://localhost:3001
```

## API

### `GET /status`
Returns the current connection state.

```json
{
  "status": "ready",
  "ready": true,
  "qr": null,
  "message": "WhatsApp is connected and ready"
}
```

States: `initialising` → `qr` → `ready`. If disconnected: `disconnected` or `auth_failure`.

### `POST /send`
Send messages to one or more recipients.

```json
{
  "recipients": [
    { "name": "Abena Mensah", "phone": "0244123456" }
  ],
  "message": "Hi Abena! New bales just arrived 🧺"
}
```

Response:
```json
{
  "sent": 1,
  "failed": 0,
  "results": [
    { "recipient": "Abena Mensah", "phone": "0244123456", "success": true }
  ]
}
```

Phone numbers can be in any format — Ghana local (`0244…`), international
(`+233244…`), or digits only (`233244…`). The server normalises them.

### `POST /disconnect`
Logs out the WhatsApp session and clears state.

## Running in Production

Use `pm2` to keep the server alive:

```bash
npm install -g pm2
pm2 start index.js --name baleshop-wa
pm2 save
pm2 startup
```

## Requirements

- Node.js 18+
- Chromium/Chrome (Puppeteer downloads it automatically on `npm install`)
- The machine running this server needs internet access and a stable connection
