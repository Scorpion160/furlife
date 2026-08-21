# Bootstrap fix v0.3.1

Correctifs issus du premier essai Windows réel du 10 août 2026.

- correction du chemin Windows `C:\\C:\\...` dans `verify-baseline.mjs` via `fileURLToPath`;
- suppression de `corepack enable` sous Windows pour éviter l'écriture de shims dans `C:\\Program Files\\nodejs`;
- utilisation de pnpm directement via Corepack, sans installation globale et sans élévation administrateur;
- installation locale et vérifiée par SHA-256 de Node.js 22.16.0 si le Node système n'est pas compatible;
- ports de développement Furlife dédiés: PostgreSQL 55432, Redis 56379, MinIO 59000/59001;
- migration automatique d'un `.env.local` v0.3 existant sans régénérer ses secrets;
- projet Docker Compose nommé `furlife-dev` pour éviter les collisions de noms;
- Flutter épinglé à 3.44.3 stable et installation locale vérifiée par SHA-256 sur Windows x64 si absent;
- CI Flutter épinglée à la même version que les postes de développement;
- doctor final exécuté après installation et migrations.

> Historique : cette version est remplacée par `BOOTSTRAP_FIX_V0_3_2.md` après validation sur un poste Windows réel.
