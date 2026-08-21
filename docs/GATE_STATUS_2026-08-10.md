# État des gates — 10 août 2026

## Validé dans l'environnement de construction

- structure monorepo et fichiers UTF-8/LF ;
- doctor de baseline sans dépendances : PASS ;
- configuration fail-closed staging/production ;
- schéma Prisma renforcé ;
- authentification Client OTP codée backend + Flutter ;
- sessions opaques révocables, rotation et détection de réutilisation codées ;
- stockage sécurisé Flutter et device ID pseudonyme ;
- route guard Flutter et restauration de session ;
- workflows CI et workflow temporaire de génération lockfile/migration préparés.

## Validé sur poste Windows réel

- Docker Desktop accessible ;
- Node.js Furlife 22.16.0 portable installé sans privilèges administrateur ;
- pnpm 9.15.4 disponible via Corepack sans `corepack enable` ;
- génération de `.env.local` avec secrets aléatoires fonctionnelle.

## Gates encore ouvertes

- `pnpm-lock.yaml` : doit être généré avec accès au registre npm ;
- migration Prisma initiale : doit être générée/exécutée contre PostgreSQL ;
- CI Node/Flutter : doit être exécutée dans une machine disposant des toolchains ;
- protection de `main` : à activer sur GitHub après que les checks portent des noms stables ;
- fournisseur SMS réel : l'adaptateur DEV console ne peut pas être utilisé en staging/production.

Aucune gate ouverte ci-dessus ne doit être marquée verte sans preuve d'exécution.
