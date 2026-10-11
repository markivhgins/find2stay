# Find2Stay — Demo

Prayagraj-first accommodation discovery site: PGs, Flats, Society/Residential homes, plus Food, Water and Packers & Movers connection services.

---

## Quick start (local, in-memory)

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Data lives in memory and resets on restart. No MongoDB needed for local dev.

---

## Environment variables

Copy `.env.example` to `.env` and edit it. The app loads `.env` automatically via dotenv.

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(unset)* | MongoDB Atlas connection string |
| `DB_NAME` | `find2stay` | Database name inside Atlas |
| `REQUIRE_MONGODB` | `false` | Set `true` to refuse startup if MongoDB is unreachable |
| `SESSION_SECRET` | *(demo value)* | HMAC secret for signed session cookies — **must** be set in production |
| `PORT` | `3000` | HTTP port (Hostinger sets this automatically) |
| `NODE_ENV` | `development` | Set `production` on Hostinger for secure cookies + secret enforcement |

> **Never commit `.env` to git.** `.env` is already in `.gitignore`.

---

## Connecting to MongoDB Atlas

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a database user (Database Access → Add new user). Note the username and password.
3. Whitelist your IP: Network Access → Add IP Address.
   - For Hostinger hosting, add `0.0.0.0/0` (allow all) or find Hostinger's outbound IP range.
4. Get the connection string: Cluster → Connect → Drivers → Node.js. It looks like:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
5. Set it as `MONGODB_URI` in your `.env` (locally) or in Hostinger's environment variables panel.

### PowerShell one-liner (local test with Atlas)

```powershell
$env:MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority"
npm start
```

The console will print `Connected to MongoDB Atlas successfully.` on success, or a clear error message (without your password) on failure.

---

## Demo sign-in

Go to `/login`. Seven room-key cards let you pick a role — no password required. The server enforces roles on every API call.

| Key | User | What they can do |
|---|---|---|
| Visitor | Aarav | Browse listings, submit visit requests, see own activity |
| Owner | Mrs. Srivastava | Pause/resume/confirm listings, see leads, submit new listing |
| Verifier | Neha | Approve or reject submitted listings |
| Operations | Rohit | Advance visits and service requests, pause any listing, access verifier queue |
| Partner · Tiffin | Annapurna Tiffins | Accept/decline food requests |
| Partner · Water | Sangam Aqua | Accept/decline water jar requests |
| Partner · Movers | Quick Shift Movers | Accept/decline move requests |

---

## Architecture notes

- **No OTP or real auth.** The demo sign-in is clearly labelled as demo-only.
- **Money in paise.** Rent, deposit and maintenance are stored as integers (₹ × 100). "From price" and move-in total are computed in `shape()`, never stored.
- **Trust rules.** Listings with lapsed `verifiedUntil` never appear. Availability older than 7 days is flagged stale; older than 14 days it is hidden.
- **Seed data.** Seeded only when the `listings` collection is empty — live data is never overwritten on restart.
- **Indexes.** 2dsphere, unique slug and a compound query index are created idempotently on startup.

---

## Changing the port (local)

```powershell
$env:PORT=3001; npm start
```
