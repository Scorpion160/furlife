# Incrément vertical 1 — Authentification Client

## Contrat API

- `POST /api/v1/auth/phone/start`
  - entrée : `{ "phoneE164": "+221..." }`
  - sortie : `challengeId`, `expiresAt`, `resendAvailableAt`
- `POST /api/v1/auth/phone/verify`
  - entrée : `challengeId`, `phoneE164`, `code`
  - sortie : access token, refresh token, expirations, profil minimal
- `POST /api/v1/auth/refresh`
  - rotation obligatoire du refresh token
- `GET /api/v1/auth/me`
  - Bearer access token
- `POST /api/v1/auth/logout`
  - révocation immédiate de la session courante

## Garde-fous

- OTP 6 chiffres généré par CSPRNG ;
- OTP jamais stocké en clair ;
- 5 tentatives par défaut ;
- expiration 5 minutes ;
- cooldown de renvoi 60 secondes ;
- rate limiting HTTP ;
- challenge consommable une seule fois ;
- création/activation du client transactionnelle ;
- access/refresh tokens opaques aléatoires ;
- tokens uniquement hashés en base ;
- rotation atomique et détection de réutilisation ;
- adaptateur OTP console interdit en production.

## Adaptateur SMS
Le MVP local utilise uniquement l'adaptateur `console` avec opt-in explicite. La prochaine intégration devra implémenter un fournisseur SMS réel derrière l'interface existante, sans changer le contrôleur ni le contrat mobile.
