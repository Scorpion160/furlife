# ADR-012 — Jetons de session opaques révocables

- Statut : accepté pour le MVP
- Date : 2026-08-10

## Contexte
Furlife doit pouvoir suspendre immédiatement un compte, révoquer une session, détecter la réutilisation d'un refresh token et limiter les erreurs de rotation déjà observées dans des applications où l'authentification a été ajoutée tardivement.

## Décision
Le MVP n'utilise pas de JWT côté client. Il utilise :

- un access token aléatoire opaque de courte durée ;
- un refresh token aléatoire opaque de longue durée ;
- uniquement les SHA-256 des tokens en base ;
- rotation du refresh token à chaque rafraîchissement ;
- famille de rotation (`familyId`) ;
- révocation immédiate côté serveur ;
- détection d'une réutilisation d'un refresh token déjà révoqué, entraînant la révocation de la famille.

Les OTP sont hachés avec HMAC-SHA-256 et un secret séparé. Les numéros utilisés dans les challenges sont indexés via un HMAC de confidentialité.

## Conséquences
Avantages : révocation simple, comportement explicite, moins de cryptographie applicative, aucun payload de token contenant des données personnelles, rotation contrôlable côté serveur.

Coût : une vérification de session côté serveur à chaque requête authentifiée. Redis pourra servir de cache de sessions lorsque le volume le justifiera, sans modifier le contrat mobile.
