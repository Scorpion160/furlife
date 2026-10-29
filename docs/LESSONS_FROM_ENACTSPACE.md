# Leçons réutilisées depuis EnactSpace

Furlife peut accélérer son développement grâce aux composants et aux incidents déjà
rencontrés sur EnactSpace, mais le code n’est pas copié aveuglément. Les deux produits
ont des domaines, des backends et des exigences de sécurité différents.

## Patterns à conserver

### 1. Stockage d’authentification sérialisé

EnactSpace a fait évoluer son stockage d’authentification vers une file d’opérations
sérialisées et un couple de tokens écrit comme une seule valeur sécurisée. Cela évite
les courses entre plusieurs écritures de secure storage et les générations de session
mélangées.

Pour Furlife :

- aucune écriture concurrente des secrets de session ;
- aucun token dans SharedPreferences ;
- nettoyage des données privées de session au logout ;
- toute restauration de session doit être testée après arrêt/reprise réelle de l’app.

### 2. Logout prioritaire sur les services optionnels

Le nettoyage push d’EnactSpace est best-effort : une panne de notification ne doit
jamais empêcher la révocation de la session.

Pour Furlife, la même règle s’appliquera aux futurs modules push, présence, cache,
téléversements temporaires et tracking.

### 3. Fichiers privés avec métadonnées fortes

Le service de fichiers EnactSpace impose notamment :

- nom de fichier normalisé ;
- contrôle taille/type ;
- scopes et visibilités ;
- checksum SHA-256 ;
- rétention explicite ;
- protection contre les chemins dangereux.

Furlife conservera ces principes mais utilisera son abstraction S3 privée prévue dans
l’architecture, avec URL signée courte et `MediaAsset.sha256`.

### 4. Notifications dédupliquées

EnactSpace évite de créer plusieurs notifications non lues identiques pour le même
utilisateur et la même entité.

Furlife adoptera un identifiant métier/déduplication autour des événements outbox afin
d’éviter les doubles notifications lors des retries.

### 5. UI testée sur plusieurs tailles et thèmes

Les corrections EnactSpace ont montré que les défauts de thème sombre, les écrans
secondaires oubliés et les layouts uniquement testés sur desktop coûtent cher en fin
de release.

Furlife impose donc dès la Definition of Done :

- mobile étroit et large ;
- clair et sombre ;
- états loading/empty/error/offline ;
- textes localisés ;
- tests widget sur les parcours critiques.

## Ce qui ne doit pas être copié

- le modèle métier Enactus ;
- les rôles et permissions EnactSpace ;
- FastAPI/SQLAlchemy : Furlife reste NestJS/Prisma ;
- le stockage fichier local du serveur : Furlife vise S3 privé ;
- les caches privés persistants non nécessaires ;
- les dépendances ou versions simplement parce qu’elles existent dans EnactSpace.

## Ordre de réutilisation conseillé

1. Auth/session et règles de nettoyage ;
2. design system et états d’interface ;
3. fichiers privés et preuves ;
4. notifications + cycle push ;
5. offline minimal et resynchronisation ;
6. biométrie comme confort de reconnexion, jamais comme source d’identité serveur.

Chaque reprise doit avoir un test Furlife propre et une justification liée à son domaine.
