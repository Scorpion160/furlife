# Definition of Done

Une fonctionnalité Furlife n'est terminée que si :

- comportement fonctionnel et cas d'erreur définis ;
- autorisation serveur testée ;
- validation d'entrée et limites anti-abus appliquées ;
- tests unitaires et, si critique, intégration ajoutés ;
- logs sans données personnelles sensibles ;
- audit ajouté pour les actions sensibles ;
- écriture idempotente lorsque la répétition peut produire un dommage ;
- migration DB réversible ou stratégie de rollback documentée ;
- UI vérifiée mobile étroit, mobile large et thème sombre/clair ;
- texte utilisateur simple, accentué correctement et sans jargon technique ;
- `flutter analyze`, `flutter test`, lint, typecheck, tests et build passent ;
- `git diff --check` passe ;
- aucun secret ou fichier `.env` réel n'est versionné.
