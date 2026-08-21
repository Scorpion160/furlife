# Furlife — Engineering Baseline v0.3.2

Correctifs Windows et gates: `docs/BOOTSTRAP_FIX_V0_3_2.md`.

Monorepo du MVP Furlife. Cette baseline privilégie la sécurité, la reproductibilité et les incréments verticaux testables avant l'ajout de fonctionnalités métier.

## Applications

- `apps/client_flutter` — application Client
- `apps/partner_flutter` — application Partner (Porteur / Livreur)
- `apps/admin` — back-office Web Next.js
- `apps/backend` — API NestJS / Prisma

## Incrément vertical disponible

Le premier flux est implémenté de bout en bout dans le code :

`téléphone -> OTP -> vérification -> compte Client -> session opaque révocable -> /auth/me -> restauration Flutter -> logout`

Voir `docs/AUTH_VERTICAL_SLICE.md` et `docs/adr/ADR-012-opaque-session-tokens.md`.

## Démarrage local Windows

Prérequis système minimum : Docker Desktop opérationnel. Le bootstrap Windows installe dans `.tools/` les versions Furlife de Node.js et Flutter si les versions système sont absentes ou incompatibles. Il n'utilise pas `corepack enable` et ne demande pas d'élévation administrateur.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap-windows.ps1
```

Ports de développement dédiés : PostgreSQL `55432`, Redis `56379`, MinIO API `59000`, console MinIO `59001`.

## Contrôles avant toute feature métier

`node scripts/verify-baseline.mjs`

Puis, lorsque les toolchains sont installées :

`pnpm verify`

et dans chaque application Flutter : format, `flutter analyze`, tests.

## Règles non négociables

- aucun secret commité ;
- aucun endpoint/URL de production codé en dur dans Flutter ;
- aucune dépendance transitive importée directement ;
- migrations versionnées ;
- CI obligatoire avant merge ;
- sessions révocables et OTP jamais stockés en clair ;
- thèmes clair/sombre et textes utilisateur centralisés ;
- changement métier accompagné de tests et critères d'acceptation.

Lire :

- `docs/ENGINEERING_BASELINE.md`
- `docs/LESSONS_FROM_KNJ_DIAMBAR.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/SPRINT0_CHECKLIST.md`
- `docs/runbooks/DEPLOYMENT_AND_ROLLBACK.md`
- `docs/runbooks/BACKUP_RESTORE.md`

## Environment convention

Furlife uses `APP_ENV` for application stages. `NODE_ENV` is reserved for Node.js frameworks and test runners and is never persisted in the shared `.env.local`.
