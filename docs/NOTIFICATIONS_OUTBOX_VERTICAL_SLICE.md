# Incrément vertical 4 — Notifications persistées via outbox

## Objectif

Transformer les événements transactionnels Furlife en notifications in-app sans appel
direct depuis les contrôleurs métier et sans doublons lors des retries.

Premier événement pris en charge :

- `shipment.submitted` -> notification `shipment_submitted` au Client.

Les autres événements peuvent être publiés sans notification tant qu'aucun handler
notification n'est défini.

## API

Tous les endpoints exigent un access token valide.

- `GET /api/v1/notifications`
  - paramètres optionnels : `unreadOnly=true|false`, `limit=1..100` ;
- `GET /api/v1/notifications/unread-count` ;
- `POST /api/v1/notifications/:id/read` ;
- `POST /api/v1/notifications/read-all`.

Une notification d'un autre utilisateur est toujours renvoyée comme introuvable.

## Déduplication

La clé n'utilise pas seulement l'ID technique de l'événement. Pour
`shipment.submitted` :

`shipment_submitted:<shipmentId>:<userId>`

Ainsi, un retry ou même un second événement logique identique ne crée pas une seconde
notification.

## Worker outbox

Le worker est volontairement séparé du processus API :

- développement : `pnpm --filter @furlife/backend worker:outbox` ;
- build : `node dist/workers/outbox.worker.js`.

Aucun `setInterval` caché n'est démarré lorsque l'API Nest démarre.

### Claim et reprise après crash

1. sélection des événements `PENDING` ou `FAILED` disponibles ;
2. claim conditionnel -> `PROCESSING`, incrément de `attempts` ;
3. `availableAt` devient une lease de 5 minutes ;
4. succès -> `PUBLISHED` + `publishedAt` ;
5. erreur -> `FAILED` + backoff exponentiel plafonné à 5 minutes ;
6. un événement resté `PROCESSING` après expiration de sa lease est récupéré au
   prochain batch.

Les échecs sont tracés dans `AuditLog` sans stocker de secret.

## Leçon reprise d'EnactSpace

EnactSpace déduplique les notifications non lues selon le destinataire et l'entité.
Furlife généralise le principe avec une `dedupeKey` unique durable. Cela protège aussi
les retries de workers et les événements dupliqués.

## Hors périmètre

- FCM/APNs/WebPush ;
- préférences de notification ;
- deep links Flutter ;
- emails/SMS transactionnels ;
- multi-consommateurs d'outbox.

Le push viendra ensuite comme canal de livraison d'une notification persistée, et non
comme source de vérité.
