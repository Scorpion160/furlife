# Retours d'expérience appliqués à Furlife

Ce document synthétise les pratiques retenues après revue des bases KËR NJOMBOOR et Diambar SAFER et des incidents rencontrés pendant leur stabilisation.

## Forces à conserver

- architecture modulaire plutôt que multiplication prématurée des services ;
- logique d'autorisation côté serveur ;
- tests, analyse statique et build avant intégration ;
- composants UI et thème centralisés ;
- sauvegardes avant modifications sensibles ;
- Git comme source de vérité avec commits bornés et rollback possible ;
- CI présente dès le dépôt ;
- usage de Git LFS pour les artefacts volumineux quand nécessaire.

## Faiblesses à ne pas reproduire

- secrets ou tokens insuffisamment protégés ;
- ports d'infrastructure exposés inutilement ;
- dépendance à des configurations manuelles non validées ;
- migrations/sauvegardes non testées jusqu'à la restauration ;
- CORS et HTTPS corrigés tardivement ;
- encodage/CRLF provoquant des scripts ou textes corrompus ;
- thèmes sombres corrigés écran par écran au lieu d'utiliser des couleurs sémantiques ;
- textes techniques visibles par l'utilisateur final ;
- CI permissive ou lockfiles non imposés ;
- déploiement sans gate explicite de santé et rollback.

## Conséquences dans Furlife v0.2

- `.gitattributes` + `.editorconfig` imposent UTF-8/LF ;
- environnement validé au démarrage par schéma ;
- CORS est une allow-list exacte ;
- Swagger est désactivable et ne doit pas être public en production ;
- PostgreSQL, Redis et MinIO ne sont accessibles que sur localhost en développement ;
- sessions, OTP hachés, idempotence, webhooks et outbox existent dans le modèle avant les paiements ;
- liveness et readiness sont séparés ;
- thèmes clair/sombre sont centralisés dès le départ ;
- textes préparés pour localisation ARB ;
- analyse Dart stricte ;
- CI exige lockfile, lint, typecheck, tests, build et Prisma validate ;
- runbooks de backup/restore et déploiement/rollback sont présents avant staging.
