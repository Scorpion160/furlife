# Incrément vertical 8 — Acceptation atomique d'un match

## Objectif

Permettre au Client de choisir une proposition tout en garantissant qu'aucun retry ni
aucune concurrence ne peut sur-réserver la capacité d'un voyage.

## Endpoint

`POST /api/v1/shipments/:shipmentId/matches/:matchId/accept`

Aucun identifiant Client, Voyageur, poids ou capacité n'est accepté depuis le body.
Toutes les données sensibles à la réservation sont relues côté serveur.

## Préconditions

- Client authentifié et propriétaire du colis ;
- match `PROPOSED` ;
- colis `MATCHING` ;
- voyage `OPEN` ;
- départ encore futur ;
- corridor du voyage identique à celui du colis ;
- capacité restante suffisante.

## Transaction atomique

Une acceptation réussie exécute dans une même transaction :

1. calcul du poids déclaré total du colis ;
2. réservation de capacité sur `Trip.reservedKg` ;
3. incrément de `Trip.version` ;
4. passage éventuel du voyage à `FULL` si la capacité est exactement remplie ;
5. `Match.PROPOSED -> ACCEPTED` ;
6. `Shipment.MATCHING -> MATCHED` + incrément de version ;
7. annulation des autres propositions `PROPOSED` du même colis ;
8. `AuditLog(action=match.accept)` ;
9. `OutboxEvent(eventType=match.accepted)`.

Si une seule de ces opérations échoue, toute la réservation est annulée.

## Concurrence

La réservation du voyage utilise un update conditionnel incluant :

- `status=OPEN` ;
- la `version` lue ;
- la valeur `reservedKg` lue.

Deux acceptations concurrentes sur les mêmes kilos ne peuvent donc pas réussir toutes
les deux. La seconde reçoit un conflit et doit actualiser ses propositions.

Le même principe protège aussi deux propositions concurrentes du même colis :
l'update `Shipment.status=MATCHING + version` n'autorise qu'un seul gagnant.

## Idempotence

Si le Client répète exactement l'acceptation d'un match déjà `ACCEPTED`, l'API
retourne le match accepté sans modifier `reservedKg`, sans nouvel audit et sans nouvel
événement.

Cette règle protège les doubles clics et les retries après timeout réseau.

## Notifications différées

Le worker traite `match.accepted` après la transaction :

- Client : `match_accepted` ;
- Voyageur : `match_assigned`.

Les deux notifications utilisent une clé de déduplication liée au match.

Une panne du canal de notification ne peut donc ni annuler ni doubler une réservation.

## Test de concurrence

L'E2E PostgreSQL crée deux colis de 3 kg face à un voyage de 5 kg puis lance deux
acceptations simultanées.

Résultat attendu :

- exactement un HTTP 201 ;
- exactement un HTTP 409 ;
- `reservedKg = 3`, jamais 6 ;
- un seul match `ACCEPTED` ;
- un seul colis `MATCHED` ;
- le retry du gagnant reste idempotent ;
- une notification Client et une notification Voyageur seulement.
