# Incrément vertical 3 — Photos privées de déclaration

## Objectif

Ajouter des photos privées à un brouillon de colis sans exposer le bucket S3 ni faire
transiter les octets par l'API applicative lors de l'upload.

Flux :

`demande d'URL PUT -> upload direct privé -> confirmation serveur -> MediaAsset -> URL GET courte`

## Endpoints

Tous les endpoints exigent un access token valide, un compte actif avec le rôle
`CLIENT`, et un colis appartenant au client courant.

- `GET /api/v1/shipments/:shipmentId/media`
- `POST /api/v1/shipments/:shipmentId/media/upload-intents`
- `POST /api/v1/shipments/:shipmentId/media/confirm`
- `GET /api/v1/shipments/:shipmentId/media/:mediaId/download`

## Garde-fous

- bucket privé uniquement ;
- aucune URL permanente enregistrée en base ;
- URL PUT présignée : 5 minutes ;
- URL GET présignée : 2 minutes ;
- JPEG, PNG et WebP uniquement ;
- 10 Mo maximum par fichier ;
- 12 médias confirmés maximum par colis ;
- photos de déclaration ajoutables uniquement tant que le colis est `DRAFT` ;
- `objectKey` aléatoire et rattaché au préfixe du shipment ;
- le `objectKey` n'est jamais renvoyé dans les vues métier après confirmation ;
- confirmation idempotente par `objectKey` ;
- isolation stricte entre clients.

## Vérification des octets

Furlife ne fait pas confiance au SHA-256 fourni par le mobile.

Après l'upload direct, l'API relit l'objet privé avec une URL signée serveur et vérifie :

1. taille réelle ;
2. SHA-256 calculé sur les octets réels ;
3. signature binaire du format (magic bytes JPEG/PNG/WebP).

Une divergence provoque le rejet de la confirmation et une suppression best-effort de
l'objet invalide.

## Signature S3

Le presigner SigV4 est implémenté avec `node:crypto` afin de ne pas ajouter de
nouvelle dépendance au monorepo. L'URL PUT signe aussi `content-type` et
`content-length`.

## Audit et événements

La confirmation valide écrit, dans la même transaction que `MediaAsset` :

- `AuditLog(action=shipment.media.confirm)` ;
- `OutboxEvent(eventType=shipment.media.confirmed)`.

Les retries d'une confirmation déjà réussie retournent le média existant sans créer
un second audit ni un second événement.

## Réutilisation d'EnactSpace

Les principes repris sont : fichier privé, métadonnées strictes, checksum, scope
métier, contrôle de taille/type et nettoyage des objets temporaires.

Différences volontaires :

- Furlife utilise S3/MinIO privé, pas le disque local du backend ;
- le client charge directement vers le stockage via URL courte ;
- le serveur recalcule le SHA-256 sur l'objet réel avant de le déclarer comme preuve.

## Hors périmètre

- suppression fonctionnelle d'une photo par le client ;
- photos de custody/livraison/incidents ;
- antivirus ;
- lifecycle S3 automatique pour les uploads jamais confirmés ;
- upload Web via POST policy avec `content-length-range`.

Ces points seront ajoutés par incréments séparés.
