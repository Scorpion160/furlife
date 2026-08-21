# Déploiement et rollback — règles minimales

1. Identifier le commit exact à déployer.
2. Vérifier CI verte et artefact reproductible.
3. Sauvegarder PostgreSQL et vérifier que le fichier n'est pas vide.
4. Tester périodiquement la restauration sur une base isolée.
5. Appliquer `prisma migrate deploy`, jamais `migrate dev` en production.
6. Démarrer la nouvelle version sans exposer directement le port applicatif à Internet.
7. Vérifier `/api/v1/health/live` puis `/api/v1/health/ready`.
8. Effectuer les smoke tests auth, lecture et écriture critique.
9. Sur échec : stopper le rollout, restaurer l'ancienne image et appliquer le plan de rollback DB prévu pour la migration.
10. Conserver SHA du commit, image/digest, heure, opérateur et résultat dans le journal de déploiement.
