# Phase 4 — La tranche fine de bout en bout : conception

> Statut : **validée en conversation le 06/10/2026**, à relire par écrit avant le plan d'implémentation.
> Remplace la liste à puces de la Phase 4 du ROADMAP comme guide de construction ; le critère de fin du ROADMAP ne change pas.

## 1. Objectif et critère de réussite

Construire d'abord **un fil complet et minimal**, puis l'élargir maillon par maillon :

> arrivée en invité → choix du club → pack de départ → effectif auto-composé → premier match guidé → récompense validée par le serveur → boutique → nouveau pack.

La tranche est réussie quand un visiteur, sans rien saisir, peut ouvrir son pack de départ, jouer un match, voir ses crédits augmenter **par le serveur** et rouvrir un pack, sur mobile comme sur ordinateur, et que **tout ce qui a de la valeur** (crédits, cartes, packs, récompenses) n'est écrit que par le serveur (règle 2).

Cible d'expérience : **premier but en moins de 3 minutes** (GDD §10).

## 2. Choix validés

| Sujet | Décision |
|---|---|
| Ordre de construction | Tranche fine de bout en bout, puis élargissement. |
| Backend | Supabase **local** (Docker) pour le développement et les tests. Le projet hébergé `legendes-du-dimanche` (eu-west-2) est actif mais **vide** ; on n'y applique les migrations qu'à la mise en ligne, avec l'accord explicite de Lucas. |
| Connexion | **Invité d'abord** : connexion anonyme Supabase à l'arrivée ; « Sauvegarder mon club » rattache ensuite le même compte à un e-mail magique. Google plus tard (demande un client OAuth de Lucas). |
| Tirage des packs | **Next.js + validation Postgres** : le serveur tire une graine (`crypto.randomBytes`), appelle le `openPack` existant, puis une fonction Postgres réservée à la clé de service enregistre le résultat. |
| Pack de départ | Tirage au hasard, **majorité du club choisi**, raretés aléatoires **sans grosse rare** (§6). |
| Interface | Coque **inspirée du mode Ultimate Team** : barre du haut, 7 onglets, grandes tuiles (§4), sans aucun nom, logo ni visuel de la marque (règle 4). |

## 3. Parcours (référence : le parcours d'un joueur du mode Ultimate Team)

**Première session**

1. Arrivée → compte invité créé automatiquement (profil, bonus de bienvenue idempotent).
2. **« Choisis ton club »** (équivalent de « Choisis ta ligue ») : un club de District 5 de l'Escaut parmi ceux du pilote.
3. **Pack de départ** ouvert sur l'écran du pack (la scène d'ouverture existante).
4. **Effectif auto-composé** (meilleur onze selon la formation), **collectifs expliqués** : avoir 7 joueurs du même club donne +3.
5. **« Les Fondations »** : chaîne d'objectifs où chacun fait toucher un mode et rapporte un pack ou des crédits. Dans la tranche : *jouer un match*, *composer l'équipe*, *ouvrir un pack*.
6. **Premier match guidé**, avec une action clé scénarisée (§8).

**Chaque jour / chaque semaine** (prévu dans la base, construit après la tranche) : 3 objectifs par jour qui expirent à 24 h ; objectifs hebdomadaires avec bonus de groupe (une semaine manquée ne se rattrape pas) ; « Match de la semaine » contre l'IA avec récompense au palier ; première montée de division ; défi de composition simple « Collectif parfait » (33 points) ; passe de saison.

**Boucle centrale** : jouer → gagner crédits ou packs → ouvrir un pack (position, club, division puis note ; walkout pour les rares) → améliorer l'équipe (collectifs) → défi ou marché → rejouer plus haut.

**Ce qui n'est pas repris** : tout achat de packs ou de crédits en argent réel (règle 5) ; tout nom, logo ou visuel de la marque (règle 4) ; tout joueur réel ou mineur (règles 3 et 6).

## 4. La coque du jeu

**Barre du haut** (toutes pages après l'accueil) : blason et nom du club + « Fondé en… », crédits, **Record** (V-N-D), niveau avec barre d'XP (XP de saison), panier vers la boutique.

**Onglets** (une page chacun) :

| Onglet du mode d'origine | Chez nous | Contenu | Dans la tranche |
|---|---|---|---|
| Central | **La Une** | objectifs du jour, Les Fondations, prochain match, packs à ouvrir | oui |
| Single Player | **Solo** | Carrière, Matchs de la semaine (contre l'IA), Tirage, Défis de composition, Onze du week-end | Carrière et Fondations ; le reste en vitrine |
| Online | **En ligne** | Championnat en ligne, Le Dimanche | onglet visible, page « Bientôt » (Phases 7-8) |
| Squads | **Équipes** | composition, formations, collectifs, tactiques | oui |
| Transfers | **Transferts** | marché | onglet visible, « Bientôt » (Phase 6) |
| Store | **Boutique** | packs, probabilités affichées, pastille « pack à ouvrir » | oui |
| My Club | **Mon club** | collection, statistiques, personnalisation | collection oui, le reste en vitrine |

Les onglets non construits restent visibles avec une page « Bientôt » claire : la navigation complète fait partie du ressenti.

**Mise en page.** Ordinateur : onglets en haut. Mobile : barre du bas à 5 entrées (La Une, Solo, Équipes, Boutique, Mon club) et « Plus » pour En ligne et Transferts. Chaque page est une grille de **grandes tuiles** (une héroïne, des secondaires, pagination quand le contenu tourne). Les images sont les nôtres : cartes 3D, avatars, blasons et maillots générés.

**Habillage.** Palette de nuit existante (pelouse sombre, jaune projecteur, craie), polices des cartes. Une **maquette de La Une** est montrée à Lucas avant de coder la coque.

**Routes** (français, comme `/carte` et `/club`) : `/jouer` (La Une), `/jouer/solo`, `/jouer/en-ligne`, `/jouer/equipes`, `/jouer/transferts`, `/jouer/boutique`, `/jouer/mon-club`, `/jouer/match` ; le parcours d'accueil est à part, `/jouer/bienvenue/club` puis `/jouer/bienvenue/pack`. La coque n'apparaît qu'après ces deux étapes.

## 5. Données et sécurité

Une migration `game_core` (nom horodaté) ; **la sécurité par ligne est activée sur chaque table**.

| Table | Rôle |
|---|---|
| `profiles` | un par compte (invité compris), créé par déclencheur à l'inscription : pseudo, club choisi, date. |
| `credit_ledger` | **ajout seul** : montant (±), raison (`welcome`, `pack`, `match`, `objective`…), référence. Une vue `wallet_balances` donne le solde dérivé. |
| `card_defs` | id (`joueur` ou `joueur~variante`), classe, note, club, poste, variante ; 9 749 lignes **peuplées par script** depuis le générateur (`supabase/seed/20_cards.sql`) ; lecture publique ; sert à vérifier qu'une carte existe. |
| `card_items` | exemplaires possédés : propriétaire, carte, origine, tirage d'origine. Doublons permis ; échanges en Phase 6. |
| `user_packs` | **inventaire de packs fermés** : type, origine (`starter`, `shop`, `objective`…), état (fermé / ouvert), tirage d'origine. |
| `pack_openings` | journal : type, **graine**, prix, cartes tirées, `request_id`. Chaque tirage est rejouable avec `openPack`. |
| `matches` | mode, graine, **équipes figées** (`MatchSetup`), état (créé / validé / rejeté), résultat validé. |
| `objective_defs`, `user_objectives` | moteur d'objectifs générique : conditions et récompenses en données ; progression par joueur. |

**Qui écrit quoi.**
- Un joueur connecté ne peut que **lire** ses propres lignes. **Aucune** règle d'insertion, de modification ou de suppression n'existe pour le client.
- Toutes les écritures passent par des fonctions Postgres `SECURITY DEFINER` dont l'`EXECUTE` est **retiré à `anon` et `authenticated`** et accordé à `service_role` seul : `claim_welcome`, `grant_pack`, `open_pack`, `create_match`, `record_match`, `advance_objective`.
- Toute fonction qui touche au solde **verrouille la ligne du profil** avant de lire le solde ; un solde ne peut pas devenir négatif.
- `claim_welcome` est idempotent : une seule ligne `welcome` par compte.

**Packs : acheter ou gagner, puis ouvrir (deux actions).**
- `grant_pack(user, type, origine, prix?)` : débite le grand livre s'il y a un prix et ajoute le pack fermé à `user_packs`, dans **une seule transaction**.
- `open_pack(pack, graine, cartes, request_id)` : le serveur Next.js tire la graine, calcule `openPack`, puis cette fonction vérifie que les cartes existent dans `card_defs`, que le pack est fermé, ajoute les `card_items`, journalise et marque le pack ouvert. Rejouer le même `request_id` **renvoie le même résultat**.
- Le prix et le contenu des packs viennent du code testé (`PACKS`) : le client ne les fournit jamais.

**Invités.** Connexion anonyme activée dans la configuration Supabase ; l'amélioration vers e-mail conserve l'identifiant. Risque d'abus (création de comptes en masse) : limites de débit et captcha avant la mise en ligne publique.

## 6. Le pack de départ

Fonction pure et déterministe `openStarterPack(club, graine)` dans `packages/data/src/packs.ts`, testée comme les autres packs.

- **18 cartes** : 11 du club choisi, 7 d'autres clubs du même district.
- **Postes garantis** (équipe toujours valide) : 2 gardiens, 6 défenseurs, 6 milieux, 4 attaquants. Part du club : 1 / 4 / 4 / 2 ; part des autres : 1 / 2 / 2 / 2. Si le club manque d'un profil, on complète depuis le district.
- **Raretés aléatoires, sans grosse rare** : bronze (commun et rare) uniquement, avec **au plus 2 argent** ; ni or, ni promo (pas de « Onze du week-end » ni d'« Ancien pro »).
- Conséquence assumée : la sortie complète du joueur (or et plus) n'a pas lieu à ce premier pack ; la version courte sert.
- Pas de probabilités par classe : la **composition** est affichée (règle 5).
- Cartes triées, la meilleure en dernier, comme `openPack`.

## 7. Objectifs, packs et récompenses

- Un objectif = une définition en données (condition, récompense) + une progression par joueur. Pas de code par objectif : les Fondations, puis les objectifs du jour et de la semaine, ne sont que des lignes.
- **Les Fondations (tranche)** : 1. jouer un match → un Pack Bronze ; 2. composer l'équipe → des crédits ; 3. ouvrir un pack → un Pack Bronze. Les valeurs sont des **valeurs de départ à équilibrer** par simulation (`packages/economy`, GDD §9.2).
- La récompense d'un objectif crée un pack fermé ou une ligne de grand livre, par `advance_objective`, **idempotente**.

## 8. Match et récompense validée

1. Le client demande un match. Le serveur (`create_match`) choisit la graine, construit les deux équipes avec `toMatchTeam`, **les fige** dans `matches` et renvoie la graine.
2. Le client joue le match (2D, actions clés en 3D) et envoie ses **entrées** (résultats des actions clés, changements).
3. Le serveur appelle **`replayMatch(setup, options, inputs)`** (le moteur est déterministe et compatible Deno) et compare au résultat annoncé. **La récompense se calcule sur le résultat rejoué**, jamais sur ce que le client déclare.
4. `record_match` crédite le grand livre (victoire en D5 : 300 CR, nul : 50 %, défaite : 25 % ; +25 CR par action clé réussie, GDD §9.2), passe le match en « validé » et avance les objectifs. Un match ne rapporte **qu'une fois**.
5. Un résultat truqué est rejeté, le match passe en « rejeté ».

**Premier match guidé.** « Action clé scénarisée » : on évite de toucher au moteur ; le plan cherchera une graine et un adversaire pour qu'une occasion nette arrive dans les premières minutes. À trancher au plan.

## 9. Structure du code

```
apps/web/src/
  app/jouer/…                 pages et coque (layout avec barre et onglets)
  components/shell/…          barre du haut, onglets, tuiles
  lib/supabase/{browser,server,admin}.ts   trois clients séparés, clé de service jamais exposée
  server/game/{wallet,packs,matches,objectives}.ts   logique serveur ; chaque entrée validée par Zod
packages/data/
  src/packs.ts                + openStarterPack
  scripts/build-card-seed.ts  → supabase/seed/20_cards.sql
supabase/migrations/…_game_core.sql
```

Textes du jeu en français dans les fichiers de messages (next-intl). La scène d'ouverture de pack du labo est **extraite** du composant `pack-lab` pour servir au vrai parcours ; le labo continue de s'en servir avec ses réglages.

## 10. Erreurs

- Erreurs typées avec message en français : solde insuffisant, pack déjà ouvert, match déjà récompensé, résultat rejeté.
- Chaque action sensible porte un `request_id` : un rejeu renvoie le résultat déjà enregistré, jamais un double débit.
- Un échec réseau pendant l'ouverture ne perd rien : le pack reste dans l'inventaire (« Pack à ouvrir » sur La Une).

## 11. Tests

- **Unitaires** : `openStarterPack` (11 du club, postes, au plus 2 argent, ni or ni promo, déterminisme, pas de doublon).
- **Sécurité en base** (Vitest contre Supabase local) : un client ne peut ni écrire dans `card_items` ou `credit_ledger`, ni appeler les fonctions réservées, ni lire les lignes d'un autre joueur ; 10 achats simultanés avec un solde pour un seul n'en laissent passer qu'un ; le bonus de bienvenue ne tombe qu'une fois ; rejouer `open_pack` avec le même `request_id` renvoie le même résultat.
- **Match** : un résultat truqué est refusé par `replayMatch` ; un match ne rapporte qu'une fois.
- **Bout en bout** (Playwright, Supabase local) : de l'arrivée à la première récompense, sur mobile et ordinateur.
- **CI** : ces tests demandent de démarrer Supabase local dans un job. Cette modification du workflow sera annoncée avant d'être faite.

## 12. Hors tranche (prévu, non construit)

Objectifs quotidiens et hebdomadaires, Match de la semaine, montée de division, défis de composition, Tirage, personnalisation du club, passe de saison, marché (tables non créées : YAGNI), Google, pseudo modifiable, rôles d'administration, validation fine de la cadence des entrées, PWA et finition (étapes suivantes de la Phase 4).

## 13. Risques et questions ouvertes

- **Abus des comptes invités** : à traiter (limites de débit, captcha) avant l'ouverture publique.
- **Projet hébergé vide** : les migrations existantes (init, univers, division connue) et la nouvelle devront y être appliquées dans l'ordre, avec l'accord de Lucas.
- **Assets des personnages v4** : le téléversement (PR #44) reste à faire pour que la sortie du joueur marche en ligne.
- **Premier but en moins de 3 minutes** : dépend du choix de la graine du premier match (§8).
- **Équilibrage** des crédits et des récompenses : valeurs de départ, à simuler.
- **Maquette de La Une** à valider avant la coque.
