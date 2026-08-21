# ADR-013 — Dépendances importées explicitement

- Statut : accepté
- Date : 2026-08-10

Avec pnpm, une application ne doit pas compter sur une dépendance transitive d'un framework. Tout package importé directement par le code Furlife doit être déclaré directement dans le `package.json` concerné.

Exemple corrigé pendant le Sprint 0 : le backend importe les types et objets Express ; `express` et `@types/express` sont donc déclarés explicitement au lieu de dépendre implicitement de `@nestjs/platform-express`.

Cette règle évite les builds qui fonctionnent sur une machine grâce au hoisting puis échouent en CI ou après une mise à jour.
