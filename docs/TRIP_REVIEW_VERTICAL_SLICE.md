# Incrément vertical 6 — Revue et ouverture d'un voyage

## Objectif

Séparer explicitement la validation interne du voyage de son ouverture au matching.

Flux :

`PENDING_REVIEW -> APPROVED -> OPEN`

- `APPROVED` signifie que l'Opérateur a validé le voyage ;
- `OPEN` signifie que le Voyageur propriétaire a décidé de rendre sa capacité
  disponible au matching.

## Autorisations

### Opérateur

`OPERATOR` ou `ADMIN` peut :

- consulter les voyages `PENDING_REVIEW` ;
- approuver un voyage.

Un Client ordinaire ou un Voyageur ne peut pas utiliser ces endpoints.

### Voyageur

Seul le `CARRIER` propriétaire du voyage peut l'ouvrir après approbation.

## Endpoints

- `GET /api/v1/admin/trips/pending`
- `POST /api/v1/admin/trips/:id/approve`
- `POST /api/v1/trips/:id/open`

Les deux transitions d'écriture exigent la version courante.

## Garde-fous

Avant approbation et avant ouverture, Furlife revalide :

- départ encore futur ;
- corridor toujours actif ;
- `reservedKg <= capacityKg` ;
- statut attendu ;
- version attendue.

Les transitions SQL sont protégées par `status + version`.

## Audit et outbox

Approbation :

- `AuditLog(action=trip.approve)` ;
- `OutboxEvent(eventType=trip.approved)`.

Ouverture :

- `AuditLog(action=trip.open)` ;
- `OutboxEvent(eventType=trip.opened)`.

## Notification

Le worker outbox traite `trip.approved` et crée une notification persistée au
Voyageur :

- type : `trip_approved` ;
- relatedType : `trip` ;
- relatedId : ID du voyage ;
- clé de déduplication :
  `trip_approved:<tripId>:<carrierId>`.

Un retry ou un événement dupliqué ne doit donc pas créer une deuxième notification.

## Hors périmètre

- rejet avec motif ;
- KYC du Voyageur ;
- modification d'un voyage soumis ;
- fermeture manuelle d'un voyage ;
- matching automatique des colis ;
- réservation atomique de capacité.

Le prochain vertical slice peut utiliser `trip.opened` comme déclencheur du matching.
