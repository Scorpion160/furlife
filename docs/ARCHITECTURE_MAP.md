# Carte d'architecture Sprint 0

Client Flutter ─┐
Partner Flutter ├── HTTPS /api/v1 ── NestJS modular monolith ── PostgreSQL
Admin Next.js ──┘                         │       │       │
                                          │       │       └── S3-compatible private files
                                          │       └────────── Redis / jobs / rate limiting
                                          └────────────────── PSP / Push / SMS / Maps adapters

Modules cibles: Identity, KYC, Corridors, Trips, Shipments, Matching, Delivery, Custody, Pricing, Payments, Incidents, Notifications, Files, Audit, Admin.
