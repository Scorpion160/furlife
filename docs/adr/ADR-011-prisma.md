# ADR-011 — Prisma comme ORM du MVP

## Statut
Adopté au Sprint 0.

## Contexte
Le backend NestJS doit rester fortement typé, versionner ses migrations PostgreSQL et permettre des tests d'intégration reproductibles.

## Décision
Utiliser Prisma pour le MVP.

## Conséquences
- Schéma de données versionné dans `apps/backend/prisma/schema.prisma`.
- Migrations générées et revues en CI.
- Les règles métier critiques restent dans les modules métier et ne sont pas déléguées à l'ORM.
