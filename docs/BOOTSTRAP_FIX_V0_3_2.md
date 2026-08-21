# Bootstrap fix v0.3.2

Date: 2026-08-10

Cette correction fait suite au premier essai Windows réel de la baseline v0.3.1.

## Incidents corrigés

1. `verify-baseline.mjs` confondait la présence locale de `.env.local` avec un secret commité.
   - `.env.local` est désormais autorisé dans l'arbre de travail local.
   - GitHub CI reste responsable du contrôle `git ls-files` qui interdit réellement les fichiers d'environnement suivis par Git.
2. Windows PowerShell 5.1 affichait certains textes UTF-8 en mojibake.
   - Le script Windows est encodé UTF-8 avec BOM et force l'encodage UTF-8 pour les outils enfants.
3. Prisma CLI ne recevait pas `DATABASE_URL` depuis `.env.local`.
   - Le bootstrap importe maintenant le fichier dans l'environnement du processus avant toute commande Prisma.
4. L'Admin Next.js ne possédait pas encore d'entrée App Router.
   - Ajout d'un `app/layout.tsx`, `app/page.tsx` et d'un style minimal pour que le build soit réel.
5. Le package Partner Flutter n'avait pas de test minimal.
   - Ajout d'un smoke test pour rendre `flutter test` et la CI déterministes.
6. Les scripts `eslint .` n'avaient pas encore de configuration TypeScript ESLint exploitable.
   - Ajout d'une configuration ESLint flat partagée à la racine.
7. Le pin direct `intl: ^0.19.0` n'était pas nécessaire et pouvait entrer en conflit avec la version épinglée par `flutter_localizations`.
   - Suppression du pin direct ; le lockfile figera la version transitive compatible.

## Principe conservé

Le bootstrap ne nécessite pas de droits administrateur pour Node/pnpm/Flutter et n'altère pas les installations système du poste développeur.
