# Sauvegarde / restauration PostgreSQL

- Sauvegarde chiffrée hors du serveur principal.
- Rétention définie par environnement.
- Contrôle automatique : taille > 0, checksum SHA-256, date et version PostgreSQL.
- Test de restauration obligatoire avant lancement pilote puis périodiquement.
- Une sauvegarde jamais restaurée avec succès n'est pas considérée comme valide.
