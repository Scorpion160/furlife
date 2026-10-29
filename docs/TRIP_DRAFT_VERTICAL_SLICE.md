# Incrément vertical 5 — Brouillon de voyage Voyageur

## Objectif

Permettre à un Voyageur déjà vérifié côté serveur de déclarer un trajet et de le
soumettre à revue opérateur sans ouvrir prématurément le matching.

Flux couvert :

`corridors actifs -> création DRAFT -> liste/détail personnel -> PENDING_REVIEW`

## Rôle

Les endpoints exigent :

- access token valide ;
- compte `ACTIVE` ;
- rôle serveur `CARRIER`.

Le rôle `CARRIER` n'est jamais accordé par ces endpoints. L'éligibilité/KYC sera
traitée séparément afin qu'un Client ne puisse pas s'auto-promouvoir Voyageur.

## Endpoints

- `GET /api/v1/trips/options`
- `POST /api/v1/trips/drafts`
- `GET /api/v1/trips/mine`
- `GET /api/v1/trips/:id`
- `POST /api/v1/trips/:id/submit`

## Règles

- corridor actif obligatoire ;
- numéro de vol : 2 à 12 caractères alphanumériques, espaces ou tirets ;
- le serveur normalise le numéro de vol en majuscules sans espaces ;
- date de départ obligatoirement future ;
- capacité déclarée entre 0,1 et 100 kg, deux décimales maximum ;
- `reservedKg` est toujours contrôlé côté serveur ;
- un Voyageur ne peut jamais consulter le voyage privé d'un autre Voyageur ;
- la soumission accepte uniquement `DRAFT` et exige la version courante ;
- la transition est protégée par `status + version` dans l'update SQL.

## Audit et outbox

Création :

- `AuditLog(action=trip.draft.create)`.

Soumission :

- `DRAFT -> PENDING_REVIEW` ;
- `AuditLog(action=trip.submit)` ;
- `OutboxEvent(eventType=trip.submitted)`.

Le worker outbox peut publier l'événement même si aucun canal de notification n'est
encore associé à `trip.submitted`.

## Pourquoi PENDING_REVIEW et non OPEN

Un trajet n'est pas rendu disponible au matching simplement parce qu'un utilisateur
l'a déclaré. La revue opérateur/KYC doit décider de l'approbation. Le prochain
incrément Voyageur pourra couvrir :

`PENDING_REVIEW -> APPROVED -> OPEN`

avec autorisation opérateur et audit dédiés.

## Tests E2E

Le test PostgreSQL réel couvre :

- refus d'un Client sans rôle CARRIER ;
- ajout du rôle serveur CARRIER ;
- catalogue de corridors ;
- création du brouillon et normalisation du vol ;
- liste personnelle ;
- isolation entre deux Voyageurs ;
- soumission avec incrément de version ;
- audit + outbox ;
- double soumission refusée ;
- date passée refusée.
