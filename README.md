# VTU Affiliate Marketer System

A multi-tenant architecture allowing affiliate marketers to run their own branded VTU platforms on top of your single backend and MongoDB database.

---

## How It Works (Architecture Overview)

```
vtupro.com  ──────────────────┐
agentbills.com  ──────────────┤──► Same Express API ──► Same MongoDB
vtusmart.yourmain.com ────────┘         ↑
                                  resolveMarketer()
                                  middleware identifies
                                  which marketer = which domain
```

Every request hits the same backend. The `resolveMarketer` middleware reads the incoming domain/subdomain and identifies which marketer it belongs to. That marketer context flows through the entire request lifecycle — affecting user auth, pricing, and data scoping.

---

## File Structure

```
affiliate-system/
├── app.js                          # Entry point
├── models/
│   ├── Marketer.js                 # Marketer schema
│   ├── User.js                     # User schema (has marketerId field)
│   └── Transaction.js              # Transaction schema (has marketerId + marketerMargin)
├── middleware/
│   └── marketerMiddleware.js       # resolveMarketer, authenticateUser, authenticateMarketer, etc.
├── services/
│   └── pricingService.js           # calculatePrice, creditMarketerWallet
└── routes/
    ├── auth.js                     # User + Marketer login/register
    ├── marketer.js                 # Marketer dashboard API
    └── vtu.js                      # Airtime, Data, Electricity etc.
```

---

## Key Concepts

### 1. Domain Resolution (`resolveMarketer` middleware)

Every request is checked in this order:

| Priority | Method | Example |
|----------|--------|---------|
| 1st | `X-Marketer-ID` header | Mobile apps send this header |
| 2nd | Full custom domain | `vtupro.com` → `domain: "vtupro.com"` |
| 3rd | Subdomain | `vtupro.yourmain.com` → `subdomain: "vtupro"` |

`req.marketer` is `null` for direct platform users.

---

### 2. User Scoping

Users have a `marketerId` field. The same email address CAN exist across different marketers — they are scoped by a compound unique index:

```js
{ email: 1, marketerId: 1 }  // unique per marketer, not globally
```

When a user logs in from `vtupro.com`, they only log in under Vtupro's users. They cannot access another marketer's account.

---

### 3. Pricing / Margins

Marketers set their own margins per service type:

```json
{
  "margins": {
    "airtime": 50,
    "data": 100,
    "electricity": 200,
    "cableTv": 150,
    "examPin": 100,
    "marginType": "flat"
  }
}
```

`marginType` can be `"flat"` (₦ amount added per transaction) or `"percentage"` (% of base price).

Each transaction records:
- `baseAmount` — what the platform pays the provider
- `amount` — what the user pays (base + margin)
- `marketerMargin` — the marketer's cut

After a successful transaction, the marketer's wallet is credited automatically.

---

### 4. Marketer Dashboard APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketer/dashboard` | Overview stats |
| GET | `/api/marketer/users` | List users with pagination + search |
| GET | `/api/marketer/users/:id` | Single user + their transactions |
| PATCH | `/api/marketer/users/:id/suspend` | Suspend/reactivate a user |
| GET | `/api/marketer/margins` | Get current margin settings |
| PUT | `/api/marketer/margins` | Update margins |
| GET | `/api/marketer/earnings` | Earnings history with filters |
| PUT | `/api/marketer/profile` | Update brand name, logo etc. |

---

## Setup

### 1. Install dependencies

```bash
npm install express mongoose bcryptjs jsonwebtoken cors dotenv
```

### 2. Environment variables (`.env`)

```env
MONGODB_URI=mongodb+srv://your-connection-string
JWT_SECRET=your-super-secret-jwt-key
PORT=5000
```

### 3. Onboard a marketer (via admin or direct DB)

```js
// POST /api/auth/marketer/register
{
  "name": "John Doe",
  "email": "john@vtupro.com",
  "password": "securePassword",
  "brandName": "VTU Pro",
  "domain": "vtupro.com",       // custom domain (optional)
  "subdomain": "vtupro"          // subdomain (optional)
}
```

Then approve them in the DB:
```js
db.marketers.updateOne({ email: "john@vtupro.com" }, { $set: { status: "active" } })
```

### 4. DNS Setup for Custom Domains

For custom domains like `vtupro.com`, the marketer needs to:
1. Point their domain's A record to your server IP
2. You add the domain to your Marketer document

For subdomains like `vtupro.yourmain.com`:
1. Add a wildcard DNS record: `*.yourmain.com → your server IP`
2. No extra config needed — the subdomain middleware handles it automatically

### 5. SSL with Nginx

```nginx
# Wildcard SSL for subdomains
server {
    listen 443 ssl;
    server_name *.yourmain.com;
    ssl_certificate /etc/letsencrypt/live/yourmain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourmain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

For custom domains, use Nginx + Certbot to issue individual SSL certs per domain, or use a service like Caddy which handles this automatically.

---

## Frontend Integration

When building each marketer's frontend (React/Next.js etc.), there is **no code change needed** between marketers. The backend automatically scopes everything by domain.

Just deploy the same frontend to each marketer's domain and the backend handles the rest.

For mobile apps, pass the marketer ID in every request header:
```js
headers: {
  "Authorization": `Bearer ${userToken}`,
  "X-Marketer-ID": "64abc123def456"
}
```

---

## Security Notes

- A user from Marketer A **cannot** access Marketer B's data — the `marketerId` scope enforces this at the DB query level.
- Marketers can only see/manage their own users — the `authenticateMarketer` middleware + `marketerId` filter in every query ensures this.
- JWT tokens embed the `marketerId`, so even if a token is stolen, it only works on the issuing marketer's platform.

## Step 6 — SSL certificate — use Nginx + Certbot:
## Certbot handles HTTPS automatically. You repeat this for each new marketer domain.

certbot --nginx -d fastreload.com -d www.fastreload.com

