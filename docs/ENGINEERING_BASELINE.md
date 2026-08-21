# Furlife — Engineering Baseline v0.2

Cette baseline est obligatoire avant le développement métier.

## Principes issus des projets précédents

1. **Monolithe modulaire d'abord.** Les frontières métier sont explicites, sans microservices prématurés.
2. **Une identité utilisateur, plusieurs rôles.** Les autorisations sont décidées côté serveur, jamais seulement dans l'interface.
3. **Fail closed.** Une intégration non configurée ne simule jamais un succès.
4. **Configuration typée et validée au démarrage.** Une variable critique absente arrête l'application.
5. **Aucun secret dans Flutter, Next public, Git ou image Docker.**
6. **Sessions révocables.** Refresh tokens hachés, rotation et révocation serveur.
7. **Écritures critiques idempotentes.** Paiements, webhooks, transferts de garde et commandes utilisent des clés d'idempotence.
8. **Traçabilité serveur.** Audit append-only, request ID, événements de chaîne de garde et temps serveur.
9. **Migrations versionnées.** Jamais de modification manuelle de production sans migration et sauvegarde.
10. **Déploiements réversibles.** Health checks, backup, migration contrôlée, vérification post-déploiement et rollback.
11. **UI centralisée.** Thème, couleurs sémantiques, textes et responsive ne sont pas recopiés écran par écran.
12. **UTF-8/LF imposés.** Les fichiers texte utilisent `.gitattributes` et `.editorconfig` pour éviter les corruptions d'encodage/CRLF.
13. **CI bloquante.** Aucun merge si lint, analyse, tests, build, Prisma validate ou hygiène Git échouent.
14. **Dépendances maîtrisées.** Lockfiles obligatoires et mises à jour automatisées revues avant merge.

## Interdictions

- ports PostgreSQL/Redis/MinIO publics en staging/production ;
- `latest` pour les images de production ;
- stockage de token d'authentification en clair ;
- OTP en clair en base ;
- CORS `*` avec credentials ;
- Swagger public en production ;
- clé S3 administrative dans une application mobile ;
- logique d'autorisation uniquement côté client ;
- opérations financières sans idempotence et journal d'audit ;
- modification de schéma de production sans test de restauration.
