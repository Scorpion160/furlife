# Incrément vertical 2 — Brouillon de colis

## Objectif

Permettre à un Client authentifié de préparer un colis sans déclencher prématurément
le matching, le paiement ou la chaîne de garde.

Flux couvert :

`options -> création DRAFT -> liste personnelle -> détail -> soumission SUBMITTED`

## Contrat API

Tous les endpoints exigent un access token opaque valide et un compte actif avec le
rôle `CLIENT`.

- `GET /api/v1/shipments/options`
  - retourne uniquement les corridors actifs et catégories de colis autorisées ;
- `POST /api/v1/shipments/drafts`
  - crée le shipment et ses parcels dans une transaction ;
  - le serveur impose `clientId`, `status=DRAFT`, `version=1` et `publicRef` ;
- `GET /api/v1/shipments/mine`
  - retourne au maximum les 100 derniers colis du client courant ;
- `GET /api/v1/shipments/:id`
  - ne révèle jamais le colis d’un autre client ;
- `POST /api/v1/shipments/:id/submit`
  - exige la version courante ;
  - accepte uniquement un `DRAFT` ;
  - revalide corridor et catégories ;
  - passe à `SUBMITTED` et incrémente la version.

## Garde-fous

- aucune identité client n’est acceptée depuis le body ;
- catégories désactivées ou inconnues refusées ;
- corridor désactivé ou inconnu refusé ;
- 1 à 20 parcels par brouillon ;
- poids strictement positif, deux décimales maximum ;
- valeur déclarée positive ou nulle, deux décimales maximum ;
- références publiques aléatoires sans donnée personnelle ;
- accès inter-client renvoyé comme `SHIPMENT_NOT_FOUND` ;
- soumission protégée par statut + version afin d’éviter les doubles transitions ;
- création et soumission auditées ;
- la soumission crée un événement outbox `shipment.submitted`.

## Événements

`shipment.submitted` est écrit dans l’outbox dans la même transaction que la
transition de statut. Les futurs modules Matching, Notifications et Pricing devront
consommer cet événement plutôt que d’être appelés directement depuis le contrôleur.

## Tests E2E

Le test PostgreSQL réel couvre :

- refus sans authentification ;
- catalogue filtré ;
- création d’un brouillon ;
- liste personnelle ;
- isolation entre deux clients ;
- soumission et incrément de version ;
- audit + outbox ;
- refus d’une catégorie interdite ;
- refus d’une seconde soumission.

## Hors périmètre de cet incrément

- photos et preuves S3 ;
- modification d’un brouillon ;
- tarification ;
- matching ;
- paiement ;
- OTP/QR de custody ;
- notifications push.

Ces éléments seront ajoutés par incréments séparés afin de préserver des PR petites et
réversibles.
