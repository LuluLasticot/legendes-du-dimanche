# Légendes du Dimanche — Roadmap

> Complément du [GDD](./GDD.md) et de l'[architecture](./ARCHITECTURE.md). Version 1.0 — 27 septembre 2026.
> Durées **indicatives** pour un développeur solo accompagné de Claude Code. Chaque phase a un **critère de fin** : on ne passe pas à la suivante tant qu'il n'est pas rempli.

```
 PORTFOLIO — Tranche verticale                               PRODUIT — Lancement officiel
 ┌────┬──────────────┬────────────┬───────────┬────────────┐  ┌─────┬─────┬─────┬──────┬──────────────┐
 │ P0 │ P1 Action clé│ P2 Moteur  │ P3 Univers│ P4 Boucle  │  │ P5  │ P6  │ P7  │ P8   │ P9 Lancement │
 │    │ 3D (risque 1)│ de match 2D│ & cartes  │ méta + prod│  │Solo │Marché│Social│ PvP │ HDF → France │
 └────┴──────────────┴────────────┴───────────┴────────────┘  └─────┴─────┴─────┴──────┴──────────────┘
  1 sem   3-4 sem       3-4 sem      3 sem       3-4 sem         4     3-4    3     5-6     continu
                                                   ▲
                                        Mise en ligne portfolio
```

---

## Phase 0 — Fondations (≈ 1 semaine)

- Monorepo pnpm + Turborepo, TypeScript strict, ESLint, Prettier, CI GitHub Actions (typecheck, lint, tests)
- `apps/web` : Next.js, Tailwind v4, page d'accueil provisoire, déploiement Vercel
- `packages/ui` : premiers tokens (couleurs, typo, espacements) en CSS variables
- `packages/engine` : squelette, **PRNG à graine**, **maths déterministes**, tests de déterminisme (Node + Deno)
- `packages/shared` : postes, formations, tiers, schémas Zod de base
- Supabase en local (CLI), première migration vide, variables d'environnement

**Critère de fin :** `pnpm dev` lance l'app, la CI est verte, le test de déterminisme passe sous Node et Deno.

✅ **Terminée le 27/09/2026** — CI verte (Node 22, Node 24, Deno 2), dépôt public [LuluLasticot/legendes-du-dimanche](https://github.com/LuluLasticot/legendes-du-dimanche).

---

## Phase 1 — Prototype d'action clé 3D (≈ 3-4 semaines) 🎯 RISQUE N° 1

L'objectif est de **valider le ressenti** avant de construire quoi que ce soit d'autre.

1. **Bac à sable physique** : ballon (gravité, traînée, Magnus, rebonds), 4 surfaces, vent ; visualisation de débogage (trajectoire prédite, vecteurs).
2. **Du geste à la trajectoire** : trace doigt/souris → projection sur le terrain → cible, effet, hauteur → résolution par tirs successifs → plafonds et cône de précision selon des stats factices réglables.
3. **Gardien et défenseurs** : réaction, portée, plongeon, parade, interception.
4. **Réalisateur de caméra v1** : plans d'intention, de suivi et de résultat, ralenti, hit-stop, secousse, replay par re-simulation.
5. **« Juice »** : traînée du ballon, filet qui se déforme, particules, sons de base (frappe, filet, sifflet, clameur).
6. **Personnages provisoires** : modèle simple + animations Mixamo (course, frappe, plongeon, célébration), **synchronisation de l'image de contact** avec la physique.
7. **Trois situations** : frappe après une passe, coup franc direct, penalty ; puis gardien en défense (plongeon).
8. **Stade en blocs gris** (greybox) puis un premier passage d'ambiance (projecteurs, main courante).
9. Page de réglage (sliders de stats, de surface, de météo) pour jouer avec les paramètres.

**Critère de fin (go / no-go) :**
- 10 testeurs jouent sans explication et **veulent rejouer** ;
- les stats se sentent (un bon finisseur est perceptiblement meilleur) ;
- 60 i/s sur desktop, 30 i/s minimum sur un mobile milieu de gamme ;
- les issues d'un même geste sont rejouables à l'identique (déterminisme).

Si le ressenti n'y est pas : itérer sur la caméra, le timing et les animations **avant** de continuer. Plan B si ça coince durablement : actions clés en 2.5D (caméra fixe, sprites) — le reste du jeu n'en dépend pas.

✅ **Terminée le 28/09/2026** — trois situations et le gardien jouables, 60 i/s sur iPhone 13, déterminisme vérifié (Node, Deno, navigateurs).

---

## Phase 2 — Moteur de match et rendu 2D (≈ 3-4 semaines)

- Simulation par phases : contexte, IA utilitaire du porteur, duels, zones, fatigue, cartons, remplacements
- Tactiques (mentalité, style, largeur, ligne, pressing) et impact des collectifs
- Conditions de jeu (surface, pluie, vent)
- Détection des actions clés → `MomentSetup` construit depuis l'état de la simulation → `MomentOutcome` réinjecté
- Rendu PixiJS vu de dessus : terrain, pions aux couleurs, ballon, flèches de passes, fil d'événements
- Commentaires v1 (≈ 150 gabarits)
- Mi-temps : changements tactiques et remplacements
- **Tests statistiques** : 10 000 matchs → buts/match par niveau, avantage à domicile, écart de note → probabilité de victoire

**Critère de fin :** un match complet se joue de bout en bout (2D + 3-6 actions clés 3D), les statistiques sont crédibles, et un match rejoué avec la même graine et les mêmes entrées donne le même score.

✅ **Terminée le 29/09/2026** — bilan :
- **De bout en bout** : `/lab/match` enchaîne avant-match, match 2D (sons, commentaires, arrêts de jeu), actions clés 3D, mi-temps (tactique, remplacements) et fin de match (notes, homme du match). Sur 1 000 matchs, 99,4 % comptent 3 à 6 actions clés (les autres n'ont eu aucune occasion en fin de match).
- **Statistiques crédibles** (10 000 matchs, `pnpm --filter @legendes/engine stats`) : domicile / nul / extérieur ≈ 46 / 22 / 31 % en District 9 ; 3,3 buts par match en District 9 contre 2,5 en National 2 ; écart de note +10 ⇒ 70 % de victoires, +20 ⇒ 87 %.
- **Rejouable** : même graine et mêmes entrées (issues des actions clés, changements du coach) ⇒ même match au bit près, vérifié par le moteur, en E2E et par le bouton « Rejouer avec les mêmes entrées ».
- **Au-delà du plan**, sur les retours de jeu : passes à choix et hors-jeu en 3D, seconds ballons (parades, montants), figurants et coureurs dans la surface, affichage mobile (D-029, D-030).
- **Reste ouvert** : enregistrer les gestes bruts pour la validation serveur (Phase 4, D-028) ; mesurer les actions clés sur un vrai mobile avec les joueurs ajoutés.

---

## Phase 3 — Univers et cartes (≈ 3 semaines)

- Import de la pyramide de la **Ligue des Hauts-de-France** (ligue, districts, divisions, clubs, stades et surfaces) → `supabase/seed`
- Générateurs (`packages/data`) : joueurs (identité, archétype, note, attributs, traits, âge, apparence), blasons, sponsors fictifs, maillots
- **Design des cartes** : gabarits bronze/argent/or (commune et rare) + 2 promos (Onze du week-end, Ancien pro) ; rendu 2D React (`packages/ui`) et rendu 3D holographique (port de Carte du Ciel)
- Personnages 3D aux couleurs du club (maillot paramétrique : couleurs, motif, numéro, sponsor)
- Images de partage générées pour chaque carte (OG)
- **Ouverture de pack** avancée ici depuis la Phase 4 (D-036) : déchirure, sortie des vestiaires de la meilleure carte, grille, probabilités affichées, tirages simulés dans `/lab/pack`

**Critère de fin :** chaque club du pilote a un effectif crédible et des maillots aux bonnes couleurs, les cartes sont belles en 2D et en 3D, et une URL de carte produit un bon aperçu sur les réseaux.

✅ **Terminée le 03/10/2026** — bilan :
- **Univers** : 205 clubs (9 de National 1 et 2, 22 de Régional 1 à 3, 174 du district de l'Escaut de D1 à D6), divisions de la saison 2026-27 toutes tirées de sources publiques, couleurs réelles pour 187 clubs (18 devinées), stades et surfaces ; seed `supabase/seed/10_universe.sql`. Aucune fiche n'est encore vérifiée par une personne.
- **Effectifs crédibles** : 4 839 joueurs fictifs et majeurs (18 à 40 ans), 22 à 25 par club dont 2 ou 3 gardiens. Le onze type suit la division : 51 en D4–D6, 60 en D1–D3, 65 en R3, 68 en R2, 71 en R1, 75 en N2, 78 en N1. 89 % de cartes bronze, 8,5 % d'argent, 2,5 % d'or.
- **Maillots aux bonnes couleurs** : les 205 tenues domicile reprennent les couleurs du club ; extérieur et gardien sont tirés pour s'en distinguer. Sur les 41 820 affiches possibles, aucune ne met face à face deux maillots indiscernables (tenue extérieure, ou troisième tenue neutre pour 57 d'entre elles).
- **Belles en 2D et en 3D** : huit gabarits dont deux promos, 9 749 cartes (base et promos) chacune retrouvée par son URL ; cartes 3D holographiques avec révélation ; joueurs 3D modélisés par nous (D-039) aux couleurs de leur club : 62 appels de dessin et 151 000 triangles sur un coup franc (budgets : 150 et 300 000).
- **Aperçu sur les réseaux** : `/carte/…` et `/club/…` ont un aperçu de lien 1200 × 630 (JPEG, ~70 Ko) et la carte une story 1080 × 1920, dessinés à partir de la carte du jeu (D-038).
- **Au-delà du plan** : l'ouverture de pack, avancée de la Phase 4 (D-036) ; `/lab/match` entre vrais clubs ; notre propre footballeur modélisé dans Blender à la place du Y Bot (D-039).
- **Reste ouvert** : faire vérifier les fiches du pilote (couleurs devinées, stades) ; mesurer cartes 3D, ouverture de pack et actions clés sur un vrai téléphone (`?stats`) ; vérifier les aperçus sur WhatsApp, Instagram et TikTok avec le vrai domaine ; captures Playwright de référence des cartes ; régler `DEFAULT_KIT_SHAPE` sur le footballeur ; la sortie du tunnel d'un vrai joueur dans l'ouverture de pack ; les autres districts.

---

## Phase 4 — Boucle méta et mise en production de la tranche verticale (≈ 3-4 semaines)

> **Construction : tranche fine de bout en bout d'abord** (conception dans `docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md`) : arrivée en invité → choix du club → pack de départ → effectif auto-composé → premier match guidé → récompense validée par le serveur → boutique → nouveau pack. On élargit ensuite chaque maillon. Interface : coque à 7 onglets (La Une, Solo, En ligne, Équipes, Transferts, Boutique, Mon club) inspirée du parcours d'un joueur du mode « équipe ultime » (GDD §3.5).

- Authentification : **invité d'abord**, rattaché ensuite à un e-mail magique (Google plus tard), profil, pseudo
- **Onboarding** : « Choisis ton club » (District 5, Hauts-de-France), **pack de départ** (majorité du club choisi, sans grosse rare), effectif auto-composé, **Les Fondations** (chaîne d'objectifs qui font toucher chaque mode), premier match guidé avec une action clé scénarisée (**premier but en moins de 3 minutes**)
- **Navigation** : coque à 7 onglets avec tuiles ; objectifs quotidiens et hebdomadaires, Match de la semaine, première montée de division, défi de composition simple
- **Ouverture de pack** branchée sur le tirage côté serveur, les crédits et la collection (la scène est faite en Phase 3, D-036)
- **Collection** (filtres, tri, détails de carte), **création d'équipe** (glisser-déposer, formations, collectifs, note d'équipe, tactiques)
- Parcours de match complet (avant-match, match, mi-temps, fin de match, notes, homme du match)
- **Crédits** (grand livre), récompenses, boutique de packs (bronze, argent, or)
- Validation serveur des matchs (Edge Function)
- PWA installable, cache des assets 3D
- Passe de finition : sons, musique, transitions, micro-interactions, états vides, erreurs
- Passe de performance, accessibilité (auto-résolution, réduction des mouvements)
- Tests E2E et régression visuelle

**Critère de fin :** la boucle **ouvrir → composer → jouer → gagner → rouvrir** est fluide, belle et sans bug bloquant sur mobile et desktop, en ligne sur un domaine public.

### 🎬 Mise en ligne portfolio
- Page d'accueil du jeu + **liste d'attente** (mesure de l'intérêt, e-mails des clubs intéressés)
- **Étude de cas** (processus, DA, moteur de match, physique, caméra, déterminisme)
- **Bande-annonce motion design** (ouverture de pack, plus beaux buts, ambiance dimanche)
- Série de devlogs (LinkedIn, TikTok/Instagram : clips de buts)
- Cartes réelles de Lucas et de quelques proches (avec accord écrit) pour les contenus

---

## Phase 5 — Profondeur solo (≈ 4 semaines)

- **Carrière complète** : saisons, montées et descentes, coupes, suspensions, récompenses de montée
- **Défis de création d'équipe** (moteur de contraintes générique + 10 premiers DCE)
- **Objectifs** quotidiens, hebdomadaires, de saison ; **passe de saison** gratuit
- **Évolutions**
- Promos fictives (Onze du week-end généré par la Carrière de la communauté)
- Traits cachés, arbitres consommables, consommables de match
- Nouvelles actions clés : corner/centre, contre-attaque, face-à-face, tacle décisif, mur
- Commentaires v2 (≈ 500 gabarits)

**Critère de fin :** un joueur a de quoi s'occuper 2 semaines sans marché ni PvP, et le simulateur d'économie valide le rythme de progression.

---

## Phase 6 — Économie entre joueurs (≈ 3-4 semaines)

- **Marché** : annonces, enchères, achat immédiat, durées, taxe de 5 %, fourchettes de prix, liste de suivi, historique des prix
- **Échanges directs** entre amis (limites, écart de valeur)
- **Simulateur d'économie** (10 000 joueurs sur 60 jours) et tableau de bord interne
- Anti-abus : limites de débit (Redis), détection de bots, comptes liés
- Tests de charge sur les fonctions d'achat (concurrence, verrous)

**Critère de fin :** aucune condition de course possible sur un achat (tests de concurrence), inflation contrôlée dans le simulateur.

---

## Phase 7 — Social et viralité (≈ 3 semaines)

- **Mon Club** (communauté du club), classements (joueurs, clubs, districts, ligues)
- **Pages publiques** des clubs et des cartes (rendu statique + CDN)
- **Partage** : carte en story (1080×1920), **export vidéo des buts** (WebCodecs + mp4-muxer)
- Amis, amicaux asynchrones, réactions prédéfinies
- Notifications push (vente, nouvelle carte du club, événement)

**Critère de fin :** partager une carte ou un but prend moins de 3 taps et le rendu est impeccable sur Instagram, TikTok et WhatsApp.

---

## Phase 8 — PvP (≈ 5-6 semaines)

1. **Championnat en ligne asynchrone** : matchmaking sur la note d'équipe, divisions de la pyramide, récompenses hebdomadaires, validation serveur
2. **Serveur temps réel** (`apps/realtime`, Colyseus, Fly.io Paris) exécutant `engine`
3. **Duel d'actions clés** : saisie simultanée attaquant/gardien, résolution serveur, lecture synchronisée
4. Reconnexion, IA de remplacement en cas d'abandon
5. **Le Dimanche** : tournoi hebdomadaire en direct (à partir de 15h), nombre de matchs limité, récompenses
6. Amicaux en direct entre amis
7. Tests de charge (objectif : pic de plusieurs milliers de matchs simultanés)

**Critère de fin :** un match en direct entre deux mobiles en 4G est fluide, juste et résistant à une coupure réseau.

---

## Phase 9 — Lancement officiel (continu)

### 9a. Préparer
- Checklist légale complète ([Données et légal](./DONNEES-ET-LEGAL.md) §9), structure juridique
- **Back-office** (`apps/admin`) : contenu, packs et probabilités, économie, modération, réclamations, support
- **Réclamer sa carte** + validation (dirigeant ou 3 coéquipiers) + **notes des coéquipiers**
- **Espace Club** : dirigeants vérifiés, effectif, déclaration des résultats et des buteurs, logo officiel
- **Cartes dynamiques** à partir des résultats réels (Onze du week-end, Homme du match, Épopée Coupe de France, Montée)
- Démarche de **partenariat** avec la Ligue des Hauts-de-France et des districts pilotes

### 9b. Bêta fermée — Hauts-de-France
- 5 à 10 clubs pilotes (idéalement proches, pour les derbies), liste d'attente
- Mesures : rétention, taux de réclamation par club, partages, retours

### 9c. Ouverture Hauts-de-France → extension nationale
- Ouverture à toute la ligue, puis **extension ligue par ligue** (import de la pyramide, blasons, stades)
- **Football féminin** intégré
- Montée en charge (réplicas, partitionnement, cache, serveurs temps réel)

### 9d. Monétisation (jamais pay-to-win)
- Cosmétiques, passe de saison premium cosmétique
- **Offre Club** (abonnement), **cartes physiques** imprimées à la demande (part reversée aux clubs)
- **Sponsoring hyperlocal** (commerces du district sur les maillots et panneaux virtuels)

---

## Extensions possibles (après lancement)

- **Belgique** (football amateur francophone et flamand — attention au cadre belge sur les loot boxes, compatible avec notre modèle sans achat de packs)
- Futsal, foot à 7, vétérans
- Voix de commentateur (synthèse vocale), commentaires personnalisés par club
- Applications mobiles (enveloppe native ou TWA) pour les stores
- Tournois inter-clubs avec lots (après validation juridique)

---

## Comment travailler avec Claude Code

- **Une phase = une branche**, découpée en PR courtes. Utiliser le mode plan de Claude Code au début de chaque phase.
- Toujours commencer une session en rappelant la phase en cours (le `CLAUDE.md` pointe vers ce fichier).
- Garder ce fichier à jour : cocher les critères de fin, noter les décisions dans `docs/DECISIONS.md` (à créer).

**Premier prompt conseillé dans Claude Code :**
> « Lis CLAUDE.md et tous les fichiers de docs/. On démarre la Phase 0 puis la Phase 1 de la ROADMAP. Commence par me proposer un plan détaillé de la Phase 0 (structure du monorepo, dépendances, scripts, CI, tests de déterminisme), puis exécute-le. Le code de ../carte-du-ciel est réutilisable pour la 3D. »
