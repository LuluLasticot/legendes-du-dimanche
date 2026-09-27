# Légendes du Dimanche — Architecture technique

> Complément du [GDD](./GDD.md). Version 1.0 — 27 septembre 2026.
> Principe directeur : **construire la tranche verticale sur des fondations qui tiennent la charge d'un lancement national**, sans sur-ingénierie au départ.

---

## 1. Vue d'ensemble

```
┌──────────────────────────── Client (PWA, mobile d'abord) ────────────────────────────┐
│  Next.js (App Router, React)  ─ UI, navigation, collection, marché, équipe          │
│     │                                                                                │
│     ├── render3d (Three.js impératif) ─ ouverture de packs · cartes holo · actions clés │
│     ├── render2d (PixiJS)             ─ match vu de dessus                             │
│     └── engine (TS pur, déterministe) ─ simulation · physique du ballon · IA           │
└──────────────┬──────────────────────────────────────────────┬───────────────────────┘
               │ HTTPS (RPC, REST)                             │ WebSocket (live PvP, phase 8)
┌──────────────▼──────────────┐                     ┌─────────▼─────────────────────┐
│ Supabase (région UE)        │                     │ Serveur de match temps réel   │
│  Postgres + RLS             │◄────────────────────│ (Colyseus, Node) — Fly.io CDG │
│  Auth · Storage · Realtime  │                     │ exécute le même `engine`      │
│  Edge Functions (validation)│                     └───────────────────────────────┘
│  pg_cron · Queues (pgmq)    │
└──────────────┬──────────────┘
               │
   CDN assets (glTF, KTX2, audio) · Images de partage générées (OG) · Sentry · PostHog (UE)
```

**L'idée clé** : le paquet `engine` est du **TypeScript pur, sans DOM, déterministe**. Il tourne à l'identique dans le navigateur (jeu), dans les Edge Functions (validation anti-triche) et sur le serveur temps réel (PvP en direct).

---

## 2. Stack

| Domaine | Choix | Pourquoi |
|---|---|---|
| Monorepo | **pnpm + Turborepo** | Paquets partagés (engine, ui, data), builds en cache |
| App web | **Next.js (App Router) + React + TypeScript strict** | Stack maîtrisée par Lucas, SSR pour les pages publiques (cartes, clubs) et le SEO |
| Styles | **Tailwind CSS v4** + design tokens (CSS variables) dans `packages/ui` | Rapide, cohérent, tokens partagés avec le rendu des cartes |
| Animations UI | **Motion (ex-Framer Motion)** + GSAP ponctuellement | Micro-interactions, transitions de pages |
| 3D | **Three.js impératif** encapsulé dans `packages/render3d`, monté par de fins composants React | Réutilisation directe du code de **Carte du Ciel** (cartes, pack, shaders, niveaux de qualité), contrôle total de la boucle de rendu, du temps et de la caméra |
| 2D match | **PixiJS v8** | Rendu WebGL 2D rapide, lisible, léger |
| Physique | **Maison, dans `engine`** (balistique + effet Magnus) | Contrôle du ressenti et déterminisme ; pas de moteur physique générique |
| Backend | **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions, pg_cron, Queues) | Tout-en-un, RLS, SQL transactionnel pour l'économie, hébergement UE |
| Validation des schémas | **Zod** dans `packages/shared` | Contrats client/serveur typés |
| Temps réel PvP | **Colyseus** (Node) sur **Fly.io** (région Paris) | Salles autoritaires, état synchronisé, faible latence |
| Cache / limites de débit | **Upstash Redis** (à partir de la phase 6) | Cotation du marché, rate limiting |
| PWA | **Serwist** (service worker) + Web Push | Installation, cache des assets 3D, notifications |
| Images de partage | **Satori / `next/og`** | Visuel automatique de chaque carte (réseaux sociaux) |
| Export vidéo | **WebCodecs + mp4-muxer** (repli : MediaRecorder WebM) | Partage des buts en vidéo, généré côté client |
| Tests | **Vitest** (unitaires, propriétés, statistiques), **Playwright** (E2E + régression visuelle) | Même approche que Carte du Ciel |
| Qualité | ESLint, Prettier, `tsc --noEmit`, CI GitHub Actions | |
| Observabilité | **Sentry** (erreurs), **PostHog UE** (analytics, avec consentement) | |
| Déploiement | **Vercel** (web), Supabase Cloud, Fly.io (temps réel) | |
| Assets 3D | **Blender** → glTF → **gltf-transform** (meshopt, KTX2) ; animations **Mixamo** retargetées sur un rig unique | |

---

## 3. Structure du monorepo

```
legendes-du-dimanche/
├── apps/
│   ├── web/                    # Next.js : jeu, pages publiques, API routes
│   ├── admin/                  # Back-office (phase 9) — Next.js, accès restreint
│   └── realtime/               # Serveur Colyseus (phase 8)
├── packages/
│   ├── engine/                 # ⚽ Cœur déterministe, zéro dépendance DOM
│   │   ├── rng/                #   PRNG à graine (sfc32/xoshiro128**), dérivation de sous-graines
│   │   ├── math/               #   Trigo/exp déterministes (pas de Math.sin en simulation validée)
│   │   ├── sim/                #   Simulation de match par phases
│   │   ├── moments/            #   Mise en place + micro-simulation des actions clés
│   │   ├── physics/            #   Ballon : gravité, traînée, Magnus, rebonds, surfaces, vent
│   │   ├── ai/                 #   Décisions des joueurs (IA utilitaire), gardien, défenseurs
│   │   ├── rating/             #   Notes, collectifs, note d'équipe
│   │   └── commentary/         #   Génération des commentaires à partir de gabarits
│   ├── render3d/               # Three.js : scènes pack, carte holo, stade, joueurs, caméra
│   │   ├── core/               #   Moteur de rendu, boucle, niveaux de qualité (repris de Carte du Ciel)
│   │   ├── cards/              #   Carte 3D, shaders holographiques, faces générées
│   │   ├── pack/               #   Ouverture de pack, séquence de révélation
│   │   ├── stadium/            #   Kit modulaire du stade, météo, éclairage
│   │   ├── players/            #   Personnages, maillots paramétriques, animations
│   │   ├── camera/             #   Réalisateur de caméra (plans, ralenti, replays)
│   │   └── fx/                 #   Traînées, filet, particules, post-traitement
│   ├── render2d/               # PixiJS : terrain vu de dessus, pions, ballon, flèches
│   ├── ui/                     # Design system : tokens, composants React, rendu 2D des cartes
│   ├── shared/                 # Types, schémas Zod, constantes (postes, formations, tiers)
│   ├── data/                   # Générateurs (joueurs, clubs, blasons, sponsors) + import de la pyramide
│   └── economy/                # Tables de packs, probabilités, simulateur d'économie
├── supabase/
│   ├── migrations/             # Schéma SQL versionné
│   ├── functions/              # Edge Functions (validation de match, tâches)
│   └── seed/                   # Données de la zone pilote
├── assets-src/                 # Fichiers Blender, textures sources (hors bundle)
├── docs/                       # GDD, architecture, roadmap, données et légal
└── CLAUDE.md
```

---

## 4. Le moteur de match (`packages/engine`)

### 4.1 Déterminisme — règles non négociables
1. **Toute aléa passe par le PRNG à graine** de l'engine. Jamais `Math.random()`.
2. **Pas de `Math.sin/cos/exp/pow/atan2` dans le code validé par le serveur** : leurs résultats peuvent différer d'un moteur JavaScript à l'autre. Utiliser les implémentations de `engine/math` (polynômes ou tables).
3. **Pas à temps fixe** (120 Hz pour la physique des actions clés), jamais basé sur le delta du rendu.
4. **Ordre d'itération stable** (tableaux, jamais d'ordre implicite d'objets ou de Set pour la logique).
5. **Entrées sérialisables** : un match = `{graine, équipes figées, tactiques, entrées du joueur horodatées en ticks}`. Rejouer ces entrées reproduit le match au bit près.
6. **Tests de déterminisme** en CI : le même match simulé 1 000 fois (et sous Node et Deno) donne le même résultat.

### 4.2 Simulation par phases
```
Match = suite de Phases (≈ 100-140)
Phase :
  1. Contexte : porteur, zone (couloir × bande), pression adverse, fatigue, minute, score
  2. Décision du porteur (IA utilitaire) : passe courte / longue / dribble / centre / frappe / dégagement
     pondérée par attributs, tactique d'équipe, instructions individuelles, traits
  3. Résolution par duel(s) : attaque vs défense, bonus de collectif, terrain, météo
  4. Si enjeu élevé (xG > seuil, CPA dangereux, penalty, face-à-face, arrêt décisif) → ActionClé
  5. Mise à jour : possession, positions cibles des 22 joueurs, fatigue, stats, événements
Sortie : chronologie d'événements horodatés → rendu 2D + commentaires
```

- **Positions des joueurs** : ancres de formation déplacées selon la position du ballon et la phase (bloc offensif ou défensif), plus un pilotage simple (steering) pour le rendu 2D. Le moteur ne simule pas chaque déplacement finement : il produit des cibles, le rendu 2D les interpole.
- **Calibrage statistique** (tests Vitest sur 10 000 matchs) : moyenne de buts par match cohérente avec le niveau (les matchs de district sont plus prolifiques que le N2), avantage à domicile, distribution des scores réaliste, écart de note → probabilité de victoire.

### 4.3 Actions clés

```
MomentSetup (engine)            MomentRun (engine, 120 Hz)             MomentView (render3d)
─────────────────────           ─────────────────────────              ─────────────────────
type, joueurs impliqués,   ──►  état ballon + joueurs, entrées   ◄──►   caméra, animations,
positions, attributs,           du joueur, IA défenseurs/gardien        effets, ralenti,
conditions, sous-graine         → MomentOutcome                         replay
```

**De la trajectoire tracée aux conditions initiales du ballon :**
1. La trace écran est projetée sur le plan du terrain (raycast caméra → sol).
2. Extraction : point cible (fin de trace), courbure (écart latéral du milieu de trace → effet), intention de hauteur (vitesse et inclinaison du geste).
3. **Résolution par tirs successifs** (shooting method, 4 à 6 itérations) : on trouve la vitesse initiale qui, avec cet effet, atteint la cible.
4. Plafonnement par les attributs (puissance max, effet max), puis **bruit à graine** dans le cône de précision (finition, pied faible, pression, traits).

**Physique du ballon** : gravité, traînée quadratique, portance de Magnus (effet), rebond avec restitution et frottement **dépendant de la surface** (pelouse, synthétique, terrain gras, stabilisé), vent.

**IA en action clé** :
- Défenseurs : temps de réaction (réactivité), vitesse max, calcul de faisabilité d'interception le long de la trajectoire.
- Gardien : délai de décision, enveloppe de portée (taille, plongeon), probabilité de capter/repousser selon la vitesse et le placement de la frappe, direction de la parade.
- En PvP direct, l'entrée du gardien adverse remplace son IA (§7).

**Couplage animation ↔ physique** : l'image de contact de chaque animation de frappe est marquée (événement d'animation) ; la physique démarre exactement à ce moment. Un placement du pied (IK léger) et un recalage du joueur vers le ballon pendant la course d'élan évitent les frappes « dans le vide ». **C'est un point clé du ressenti.**

---

## 5. Rendu 3D (`packages/render3d`)

### 5.1 Réutilisation de Carte du Ciel
Modules à porter et adapter : `render/engine.ts` (boucle), `render/quality.ts` (niveaux de qualité), `render/fx.ts`, `cards/card.ts` et `cards/faces*.ts` (carte 3D et génération des faces en worker), `pack/pack.ts` (ouverture), `shaders/` (holographie), `core/motion.ts` (animation, interpolations), `core/random.ts` (à remplacer par le PRNG de l'engine), `audio/audio.ts`.

### 5.2 Réalisateur de caméra
- Une **liste de plans** par type d'action clé et par étape (mise en place → saisie → déclenchement → vol → résultat → célébration → replay).
- Plans définis en données : rails (courbes Catmull-Rom), suivi à ressort, orbite, focale, profondeur de champ.
- **Contrôle du temps** global (échelle de temps pour le ralenti, hit-stop de 2-3 images), secousse, transitions en coupe franche ou en fondu.
- **Replay** = re-simulation déterministe du moment avec un autre plan de caméra (aucun enregistrement d'images nécessaire).

### 5.3 Personnages
- Un **modèle de base low-poly stylisé** (Blender), variations par morphes (morphologie), coiffures en meshes séparés, carnations par uniformes de shader.
- **Maillot paramétrique** : un seul matériau, shader qui compose couleurs du club, motif (uni, rayé, cerclé, bandes, damier), numéro et texte du sponsor (atlas généré).
- **Animations** : un rig unique, clips Mixamo retargetés et nettoyés (course, sprint, frappe intérieur/cou-de-pied/extérieur, tête, volée, passe, contrôle, plongeons gardien, célébrations, déception). `AnimationMixer` avec machine à états et fondus.
- **Instanciation** pour la foule et les éléments répétés.

### 5.4 Budgets de performance (mobile milieu de gamme)
| Élément | Budget |
|---|---|
| Fréquence | 60 i/s visé, 30 i/s minimum garanti (niveau de qualité bas) |
| Appels de dessin (scène action clé) | < 150 |
| Triangles | < 300 000 |
| Textures | KTX2 (Basis), atlas |
| Poids initial de la scène 3D | < 8 Mo (chargement progressif, mis en cache par le service worker) |
| JS initial de l'app (hors 3D) | < 250 Ko gzip ; 3D chargée à la demande |

---

## 6. Données et backend

### 6.1 Principes
- **Serveur autoritaire pour tout ce qui a de la valeur** : tirages de packs, crédits, marché, récompenses, résultats de match classés.
- **Row Level Security partout**. Les écritures sensibles passent par des **fonctions Postgres `SECURITY DEFINER`** transactionnelles (verrous de lignes), jamais par des `update` directs depuis le client.
- **Grand livre des crédits** : aucune modification de solde sans ligne dans `credit_ledger` (source, montant, référence). Le solde est dérivé et vérifiable.
- **Tirage de packs** côté serveur (`gen_random_bytes` de pgcrypto), journalisé (`pack_openings`) pour l'audit et l'affichage des probabilités réelles.

### 6.2 Schéma (tables principales)

**Univers**
- `leagues` (ligues), `districts`, `divisions` (niveau, rang, profondeur variable), `competitions`, `seasons`
- `clubs` (nom, ville, district, couleurs, motif, stade, surface, blason généré, statut partenaire)
- `club_seasons` (division de l'équipe fanion par saison)

**Joueurs et cartes**
- `player_identities` (fictive ou réelle, club, poste, apparence, `is_real`, consentement)
- `card_defs` (une version de carte : identité, type/promo, note, attributs JSON, traits, tier, rareté, dynamique ou non)
- `card_items` (exemplaires possédés : propriétaire, card_def, échangeable, source, date)
- `teammate_ratings`, `card_claims` (réclamations, statut, validateurs)

**Joueurs du jeu**
- `profiles` (pseudo, club suivi, préférences), `squads` (formation, positions, tactiques, JSON validé par Zod)
- `credit_ledger`, `wallets` (solde dérivé)
- `pack_catalog`, `pack_odds`, `pack_openings`

**Jeu**
- `matches` (mode, graine, snapshot des équipes, entrées, résultat, statut de validation)
- `objectives`, `user_objectives`, `sbc_defs`, `sbc_submissions`, `evolutions`, `user_evolutions`
- `online_divisions`, `weekly_results`, `events`, `tournaments`

**Marché**
- `market_listings` (index partiel sur `status = 'active'`), `market_bids`, `trades`, `price_history` (agrégats)

**Social et modération**
- `club_memberships`, `friendships`, `reports`, `moderation_queue`, `audit_log`

### 6.3 Validation d'un match classé
1. Le client demande un match → le serveur crée `matches` avec **graine et snapshots**, renvoie la graine.
2. Le client joue et envoie ses **entrées** (traces normalisées, horodatées en ticks).
3. Une Edge Function (ou un worker via la file `pgmq`) **re-simule** avec `engine` et compare le résultat.
4. Si c'est conforme, les récompenses sont créditées via le grand livre. Sinon, le match est rejeté et le compte signalé.
5. Contrôles additionnels : durée plausible, cadence des entrées, taux de réussite aberrants.

### 6.4 Tâches planifiées (pg_cron + files)
Récompenses hebdomadaires, rotation des promos, recalcul des fourchettes de prix, expiration des annonces, agrégats de classement, fin de saison, purge RGPD.

---

## 7. PvP en direct (phase 8)

- **Salle Colyseus** par match, qui exécute `engine` en autorité.
- Les deux clients reçoivent la même graine et les mêmes événements, et rendent la simulation localement.
- **Action clé en duel** : le serveur envoie le `MomentSetup` aux deux ; fenêtre de saisie simultanée (≈ 4 s) — trace de l'attaquant, choix du gardien de l'autre ; entrées cachées jusqu'à la résolution ; le serveur résout et diffuse `MomentOutcome` + sous-graine pour une lecture identique des deux côtés.
- **Robustesse** : reconnexion (état reconstruit depuis la graine et le journal d'entrées), IA de remplacement en cas d'abandon, compensation de latence par fenêtres de saisie (pas de réflexe à la milliseconde).
- **Matchmaking** : note d'équipe + division, file par région, élargissement progressif.

---

## 8. Montée en charge (objectif : toute la France)

| Hypothèse lancement national | Ordre de grandeur |
|---|---|
| Joueurs actifs par jour | 50 000 à 150 000 |
| Pic du dimanche (connexions simultanées) | 10 000 à 30 000 |
| Cartes définies (joueurs fictifs + réels) | ~300 000 à 500 000 |
| Exemplaires de cartes possédés | dizaines de millions |

- **Postgres** : index soignés, partitionnement de `card_items`, `credit_ledger` et `matches` par période ; réplicas en lecture pour les pages publiques et classements.
- **Pages publiques** (cartes, clubs) en rendu statique incrémental + CDN.
- **Marché** : cotations et listes chaudes en cache Redis, écriture transactionnelle dans Postgres.
- **Temps réel** : serveurs Colyseus horizontaux derrière un répartiteur, à l'échelle du pic dominical.
- **Assets** : CDN, versionnés, immuables.

---

## 9. Sécurité et anti-triche

- Serveur autoritaire (tirages, crédits, marché, résultats)
- Validation déterministe des matchs, détection statistique d'anomalies
- Limites de débit sur toutes les routes sensibles
- Détection de bots sur le marché (cadence, schémas d'achat), détection des transferts de valeur entre comptes liés
- Fourchettes de prix pour empêcher la revente de crédits hors du jeu
- Rôles : joueur, dirigeant vérifié, modérateur, admin (claims JWT + RLS)
- Secrets uniquement côté serveur, audit des actions d'admin

---

## 10. Qualité et tests

| Type | Outil | Exemples |
|---|---|---|
| Unitaires | Vitest | Collectifs, notes, formations, tirages de packs |
| Propriétés | Vitest + fast-check | Une note reste dans sa plage, un solde ne devient jamais négatif |
| Déterminisme | Vitest (Node + Deno) | Même graine + mêmes entrées → même résultat |
| Statistiques | Vitest | 10 000 matchs : buts/match, avantage à domicile, écart de niveau |
| Économie | Script `packages/economy` | 10 000 joueurs simulés sur 60 jours : inflation, temps pour obtenir une carte or |
| E2E | Playwright | Onboarding → pack → équipe → match → récompense |
| Régression visuelle | Playwright | Cartes, ouverture de pack, écrans clés (comme Carte du Ciel) |
| Performance | Playwright + traces | Fréquence en action clé sur profil mobile |

---

## 11. Conventions

- TypeScript `strict`, pas de `any`. Schémas Zod pour toute donnée qui traverse une frontière (réseau, stockage, JSON).
- Nommage : code et identifiants en anglais, textes du jeu en français (fichiers de traduction dès le départ, pour une future extension en Belgique francophone et néerlandophone).
- `engine` n'importe **rien** de `render*`, `ui` ou `apps`.
- Les scènes 3D exposent une API impérative (`mount`, `play(moment)`, `dispose`) ; React ne touche jamais aux objets Three.js directement.
- Commits conventionnels, une PR par fonctionnalité, CI verte obligatoire.
