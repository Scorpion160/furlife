# Incrément vertical 9 — Règles tarifaires et quote serveur

## Objectif

Calculer le prix d'un colis `MATCHED` exclusivement côté serveur avant toute
création de paiement PSP.

Furlife ne possède ni wallet interne ni montant fourni par le mobile.

## Modèle V1

Une seule règle tarifaire existe par corridor :

`total = max(minimumFee, baseFee + pricePerKg × poidsDéclaré)`

Les montants sont stockés en `Decimal(14,2)`.

Le poids utilisé est la somme des `Parcel.declaredWeight`, donc une donnée déjà
validée côté serveur.

## Configuration opérateur

Endpoints :

- `GET /api/v1/admin/pricing-rules`
- `PUT /api/v1/admin/pricing-rules/:corridorId`

Rôles autorisés :

- `OPERATOR`
- `ADMIN`

Les montants sont transmis sous forme de chaînes décimales, par exemple :

`"1500.00"`

Cela évite de faire transiter les montants financiers via des nombres flottants JSON.

Création :

- aucune `version` fournie ;
- la règle démarre à `version=1`.

Mise à jour :

- la version courante est obligatoire ;
- update conditionnel par version ;
- conflit -> `PRICING_RULE_VERSION_CONFLICT`.

## Quote Client

Endpoint :

`POST /api/v1/shipments/:shipmentId/pricing/quote`

Le body est vide. Le Client ne peut fournir ni :

- montant ;
- devise ;
- poids ;
- règle tarifaire ;
- match.

Le serveur vérifie :

1. ownership du colis ;
2. statut `MATCHED` ;
3. présence d'un match `ACCEPTED` ;
4. règle active pour le corridor ;
5. poids déclaré positif.

## Snapshot immuable

La `PricingQuote` enregistre :

- `matchId` unique ;
- règle et version utilisées ;
- devise du corridor ;
- poids ;
- base ;
- part variable ;
- total final.

Un retry renvoie la même quote.

Si l'Opérateur modifie ensuite la règle tarifaire, la quote existante ne change pas.
Un nouveau colis coté après la modification utilise la nouvelle version.

## Contraintes base de données

La migration impose également :

- montants de règle >= 0 ;
- poids de quote > 0 ;
- montants de quote >= 0 ;
- une règle par corridor ;
- une quote par match accepté.

## Pourquoi le paiement vient après

Le futur module PSP consommera uniquement `PricingQuote.totalAmount` et
`PricingQuote.currency`.

Ainsi :

- aucun montant arbitraire ne vient du mobile ;
- le calcul est auditable ;
- le fournisseur de paiement reste interchangeable ;
- aucune logique d'escrow maison n'est introduite.
