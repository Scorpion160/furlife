# Furlife v0.3.5 — Jest TypeScript gate

## Problème corrigé

Jest 29 exécutait les fichiers `*.spec.ts` sans transformation TypeScript, ce qui provoquait `Cannot use import statement outside a module`.

## Correctif

- ajout de `apps/backend/jest.config.cjs` ;
- transformation `*.ts` via `ts-jest` ;
- environnement de test Node explicite ;
- conservation du `tsconfig.json` backend CommonJS comme source de vérité.

Aucune migration DB ni modification métier n'est introduite.
