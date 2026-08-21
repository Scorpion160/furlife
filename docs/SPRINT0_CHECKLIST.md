# Sprint 0 — Gate de sortie v0.2

## Repository
- [x] UTF-8/LF imposés
- [x] versions Node/pnpm définies
- [x] PR template / CODEOWNERS / Dependabot
- [ ] `pnpm-lock.yaml` généré et commité avant activation CI
- [ ] protection branche main configurée dans GitHub

## Backend
- [x] configuration validée au démarrage
- [x] CORS explicite par environnement
- [x] Helmet, compression, validation globale, rate limiting
- [x] request ID et enveloppe d'erreur stable
- [x] liveness/readiness séparés
- [x] Prisma service et arrêt propre
- [x] schéma sessions/OTP hash/idempotence/webhook/outbox/audit
- [x] authentification OTP réelle (adaptateur console DEV + interface fournisseur)
- [x] sessions opaques : rotation/révocation + détection de réutilisation implémentées
- [ ] tests d’intégration DB de rotation/révocation exécutés
- [ ] Redis et stockage objet intégrés

## Données
- [x] modèle initial renforcé et indexé
- [ ] première migration Prisma générée après connexion DB locale
- [ ] seed minimal contrôlé
- [ ] test de migration et rollback documentaire

## Flutter
- [x] architecture `app/core/features`
- [x] thèmes clair/sombre centralisés
- [x] configuration API via `--dart-define`
- [x] HTTPS exigé en production
- [x] stockage sécurisé ajouté comme dépendance
- [x] analyse statique stricte
- [x] routeur/auth guard implémentés
- [x] client HTTP centralisé et erreurs typées
- [x] localisation ARB français

## Admin
- [x] TypeScript strict conservé
- [x] en-têtes de sécurité initiaux
- [ ] auth serveur + MFA admin
- [ ] CSP avec nonces lors de l'intégration finale

## Infrastructure
- [x] DB/Redis/MinIO bindés sur localhost en dev
- [x] variables obligatoires au lieu de secrets codés en dur
- [x] health checks
- [x] runbooks backup/restore et déploiement/rollback
- [ ] images de staging/prod épinglées par digest
- [ ] reverse proxy TLS staging
- [ ] sauvegarde chiffrée et restauration testée

## Gate
Aucun développement métier P1 ne commence avant : lockfiles + première migration + CI verte + branche protégée + environnement local reproductible.
