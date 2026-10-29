# Incrément vertical 7 — Propositions de matching

## Objectif

Créer automatiquement des propositions de voyage compatibles sans réserver de
capacité ni engager le Client ou le Voyageur.

Déclencheurs outbox :

- `shipment.submitted` ;
- `trip.opened`.

Les deux déclencheurs appellent le même moteur idempotent.

## Critères V1

Une proposition est éligible uniquement si :

- le colis est `SUBMITTED` ou déjà `MATCHING` ;
- le voyage est `OPEN` ;
- le corridor est identique ;
- le départ est dans le futur ;
- `capacityKg - reservedKg >= poids déclaré total du colis`.

Le poids du colis est la somme des `Parcel.declaredWeight`.

## Ce qui n'est volontairement pas fait

Une proposition `PROPOSED` :

- ne réserve aucun kilogramme ;
- ne change pas `reservedKg` ;
- n'engage pas de paiement ;
- n'assigne pas le Voyageur ;
- ne fait pas passer le colis à `MATCHED`.

La réservation atomique de capacité sera faite uniquement lors de l'acceptation d'un
match dans un vertical slice séparé.

## Score

Le score V1 vaut `100` pour toute proposition éligible.

Ce choix est volontaire : Furlife ne fige pas prématurément une formule de ranking
sans données produit. L'ordre d'exploration privilégie pour l'instant les départs les
plus proches.

## Idempotence

La contrainte Prisma existante :

`@@unique([shipmentId, tripId])`

est utilisée comme garde-fou ultime.

Le moteur intercepte un conflit `P2002` et considère alors la proposition comme déjà
existante. Un retry outbox ou un second déclencheur ne crée donc pas de doublon.

## Transition du colis

Dès qu'au moins une proposition `PROPOSED` existe :

`SUBMITTED -> MATCHING`

avec incrément de version.

La transition crée dans la même transaction :

- `AuditLog(action=shipment.matching.start)` ;
- `OutboxEvent(eventType=shipment.matching.started)`.

## Notification

`shipment.matching.started` produit une notification in-app dédupliquée :

- type : `shipment_matching_started` ;
- relatedType : `shipment` ;
- relatedId : ID du colis.

## API Client

- `GET /api/v1/shipments/:shipmentId/matches`

L'endpoint exige un Client authentifié propriétaire du colis. Le colis d'un autre
Client est renvoyé comme introuvable.

## Limites anti-abus

- 100 voyages maximum scannés par déclenchement ;
- 20 propositions maximum exposées par colis ;
- 100 colis maximum scannés lors de l'ouverture d'un voyage.

## Suite

Le prochain slice Matching devra traiter l'acceptation d'une proposition avec :

- réservation atomique de capacité ;
- contrôle de concurrence ;
- `PROPOSED -> ACCEPTED` ;
- `MATCHING -> MATCHED` ;
- annulation des propositions concurrentes ;
- audit + outbox + notifications.
