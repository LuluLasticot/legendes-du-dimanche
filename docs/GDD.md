# Légendes du Dimanche — Game Design Document

> **Nom : Légendes du Dimanche** (retenu le 27/09/2026, ex-nom de code « Main Courante » ; dépôt INPI à vérifier, voir §14).
> **Accroche : « Ton club. Ta carte. Ta légende. »** (ancienne accroche, redondante avec le nom : « Le foot du dimanche mérite ses légendes. »)
> Version 1.0 — 27 septembre 2026 — Lucas Souton

---

## 0. Résumé en une page

**Légendes du Dimanche** est un jeu web (PWA, mobile d'abord) de collection de cartes et de gestion d'équipe inspiré des modes « équipe ultime » des grands jeux de foot, **entièrement consacré au football amateur français** : District, Régional (R1 à R3/R4), National 2 et National 1.

- Tu **ouvres des packs**, tu **collectionnes les cartes** de joueurs amateurs, tu **construis ton onze** en jouant sur les collectifs (même club, même district, même ligue).
- Tu **joues des matchs** : simulation 2D vue de dessus, avec des **actions clés jouables en 3D** façon *Score! Hero* (tu traces la passe ou la frappe, la caméra s'emballe, ralenti, filet qui tremble).
- Tu **gagnes des crédits**, tu **échanges** sur le **marché des transferts**, tu relèves des **défis de création d'équipe**, tu grimpes la **pyramide** du District 5 jusqu'au National 1.
- À terme, **les vrais joueurs réclament leur carte**, les clubs animent leur communauté, les vrais résultats du week-end font évoluer les cartes, et chaque dimanche à 15h, toute la France joue en direct.

**Double objectif :**
1. **Portfolio** — une tranche verticale d'un niveau de finition « studio » qui démontre design produit, DA, motion, 3D temps réel et ingénierie.
2. **Produit** — si l'accueil est bon, lancement officiel national, en commençant par la Ligue des Hauts-de-France.

**Chiffres qui donnent l'échelle :** la FFF a dépassé les **2,3 millions de licenciés** (record 2023-24) pour environ **12 000 clubs amateurs**. Chacun d'eux est un joueur potentiel qui veut voir **sa propre carte**.

---

## 1. Piliers de design

Toute décision doit servir au moins un de ces piliers. En cas de conflit, l'ordre fait foi.

1. **La fierté — « C'est MA carte. »** Chaque joueur amateur doit se sentir valorisé comme un pro. Les cartes, les révélations et les statistiques sont traitées avec le sérieux et le prestige d'un jeu AAA.
2. **Le frisson du geste.** Les actions clés en 3D doivent procurer une vraie sensation (anticipation, impact, ralenti, célébration). C'est ce qui distingue le jeu d'un simple gestionnaire.
3. **L'authenticité du dimanche.** L'humour et la culture du foot amateur (buvette, terrain gras, main courante, sponsors de boulangerie) vivent dans les détails, jamais au détriment du prestige des cartes.
4. **Le local avant tout.** Le district, le derby, le club du village d'à côté : la géographie réelle est le moteur des collectifs, des classements et de la viralité.
5. **Équitable et sain.** Pas de pay-to-win, pas d'achat de packs avec de l'argent réel, une économie lisible, des probabilités affichées.

---

## 2. Public cible

| Segment | Motivation | Ce qu'on leur offre |
|---|---|---|
| **Joueurs amateurs licenciés** (18-40 ans, cœur de cible) | Se voir en carte, chambrer les coéquipiers, fierté locale | Réclamer sa carte, notes des coéquipiers, cartes « Onze du week-end », partage |
| **Fans de modes « équipe ultime »** | Packs, collection, marché, compétition | Boucle complète packs/marché/DCE/PvP, sans pay-to-win |
| **Dirigeants et éducateurs de clubs** | Animer et fédérer leur club, attirer des licenciés et des sponsors | Espace Club, page publique du club, cartes physiques, classement des clubs |
| **Entourage** (familles, supporters locaux, anciens) | Suivre le club, nostalgie | Légendes locales, pages club, partages |
| **Recruteurs / studios** (cible portfolio) | Évaluer le niveau de Lucas | Tranche verticale ultra soignée, étude de cas, making-of |

Plateformes : **mobile web d'abord** (installable en PWA), desktop pleinement supporté. Session type : 3 à 10 minutes, plusieurs fois par jour ; session longue le dimanche.

---

## 3. Boucle de jeu

### 3.1 Boucle principale (minutes)

```
 Ouvrir un pack ──► Améliorer son onze ──► Jouer un match ──► Gagner des crédits ──┐
        ▲                                   (actions clés 3D)                    │
        └──────────────────── Marché / Défis / Objectifs ◄───────────────────────┘
```

### 3.2 Boucle intermédiaire (jours)
Objectifs quotidiens et hebdomadaires, défis de création d'équipe, progression en Carrière, montée en division dans le Championnat en ligne, cartes spéciales du week-end.

### 3.3 Boucle longue (saisons)
Saisons de 6 à 8 semaines calées sur le **vrai calendrier du foot amateur** (reprise en août, Toussaint, trêve hivernale, épopées de Coupe de France, montées et descentes en mai-juin). Passe de saison, collections complètes, légendes, classements des clubs.

### 3.4 Boucle sociale (communauté)
Mon club (communauté du vrai club), derbies, amis, échanges, partage de cartes et de buts en vidéo, « réclame ta carte ».

### 3.5 Parcours d'un nouveau joueur et navigation

Référence : le parcours d'un joueur du mode « équipe ultime » des jeux de football grand public, dont on reprend les **processus et la structure**, jamais l'habillage ni les noms (règles 4 et 5).

- **Première session** : arrivée en invité (aucun formulaire) → « Choisis ton club » (un club de District 5) → **pack de départ** (18 cartes dont 11 du club, raretés aléatoires sans grosse rare) → effectif composé automatiquement, collectifs expliqués → **« Les Fondations »**, chaîne d'objectifs où chacun fait toucher un mode (jouer un match, composer l'équipe, ouvrir un pack, jouer un défi) et rapporte un pack ou des crédits.
- **Chaque jour et chaque semaine** : 3 objectifs par jour (expirent à 24 h) ; objectifs hebdomadaires avec bonus de groupe (une semaine manquée ne se rattrape pas) ; Match de la semaine contre l'IA ; montée de division ; défi de composition simple ; passe de saison.
- **Navigation** : barre du haut (blason, nom, « Fondé en », crédits, record, niveau et XP, panier) et 7 onglets : **La Une, Solo, En ligne, Équipes, Transferts, Boutique, Mon club**. Chaque page est une grille de grandes tuiles. Sur mobile, barre du bas à 5 entrées et « Plus ». Les modes pas encore construits restent visibles avec une page « Bientôt ».
- Conception détaillée : `docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md`.

---

## 4. L'univers : la pyramide du football amateur

### 4.1 Structure (saison 2026-27)

Depuis le 1er juillet 2026, la **Ligue 3** est une division professionnelle : **elle est exclue du jeu** (droits des joueurs pros). En dessous, l'ancien National 2 devient le **National 1** (4e niveau, 3 groupes de 16 clubs) et l'ancien National 3 devient le **National 2** (5e niveau, 8 groupes régionaux de 14 clubs). Le sommet de l'univers du jeu est le **National 1**.

| Échelon | Niveau | Tier de carte |
|---|---|---|
| National 1 | National (amateur) | **Or** |
| National 2 | National (amateur) | **Or** |
| Régional 1 | Ligue régionale | **Argent** |
| Régional 2 | Ligue régionale | **Argent** |
| Régional 3 (et R4 selon les ligues) | Ligue régionale | **Argent / Bronze** |
| District 1 à District 5+ (variable selon les districts) | District | **Bronze** |

- **13 ligues régionales métropolitaines** et les ligues ultramarines, découpées en **districts**. Le nombre de divisions de district varie d'un district à l'autre : le modèle de données doit accepter une profondeur variable.
- **Zone pilote : Ligue de Football des Hauts-de-France** (districts : Flandre, Artois, Escaut, Côte d'Opale, Maritime Nord, Somme, Oise, Aisne… à confirmer lors de l'import).
- **Football féminin** : intégré au lancement officiel (R1 féminine, championnats de district féminins, D3 féminine), avec des équipes mixtes autorisées comme dans les jeux récents et un filtre possible.
- **Hors périmètre initial** : les jeunes (mineurs, voir le document Données et légal), le futsal et le foot à 5/à 7 (extensions possibles).

### 4.2 Clubs
- **Vrais noms de clubs**, **blasons générés par le jeu** (les logos réels sont des marques : jamais utilisés sans accord écrit). Les clubs partenaires pourront fournir leur logo officiel au lancement.
- Chaque club possède : nom, ville, district, ligue, division de l'équipe fanion, couleurs (2-3), motif de maillot (uni, rayé, cerclé, bandes, damier), stade (nom, type de surface), année de fondation si connue, sponsors fictifs générés (« Boulangerie Dupont », « Garage du Centre », « Friterie Chez Momo ») ou réels pour les clubs partenaires.

### 4.3 Joueurs
- **Phase portfolio** : 100 % fictifs, générés de façon crédible (voir §5.4), sauf les cartes de Lucas et de ses proches avec leur accord écrit.
- **Lancement officiel** : les joueurs fictifs peuplent le monde ; les vrais joueurs réclament ou reçoivent leur carte avec leur consentement et **remplacent** progressivement les fictifs de leur club.

---

## 5. Les cartes

### 5.1 Anatomie d'une carte joueur

```
┌───────────────────────────┐
│ 74   [blason]   [ligue]   │  Note générale · Club · Ligue
│ AG                        │  Poste principal
│      ┌─────────────┐      │
│      │   PORTRAIT  │      │  Photo (joueur réel consentant) ou avatar stylisé
│      └─────────────┘      │
│      K. BENALI            │  Nom affiché
│ 82 VIT   71 DRI           │
│ 64 TIR   38 DÉF           │  6 attributs principaux
│ 69 PAS   61 PHY           │
│ ★★★ PF · ★★★★ GT · Poumon │  Pied faible, gestes techniques, trait
└───────────────────────────┘
```

**Attributs principaux** (moyennes pondérées des sous-attributs) :
- **VIT (vitesse)** : accélération, vitesse de pointe
- **TIR** : placement, finition, puissance de frappe, frappes lointaines, volée, penalty
- **PAS (passe)** : vision, centres, coups francs, passes courtes, passes longues, effet
- **DRI (dribble)** : agilité, équilibre, réactivité, contrôle, dribble, sang-froid
- **DÉF (défense)** : interceptions, jeu de tête, marquage, tacle debout, tacle glissé
- **PHY (physique)** : détente, endurance, force, agressivité

**Gardiens** : PLO (plongeon), MAI (jeu à la main), PIE (jeu au pied), RÉF (réflexes), VIT, PLA (placement).

**Méta-données** : poste principal et postes secondaires, pied fort, pied faible (1-5★), gestes techniques (1-5★), taille, âge, traits, club, district, ligue, division, numéro, surnom (optionnel, validé).

**Postes** : G, DD, DC, DG, DLD, DLG (latéraux offensifs), MDC, MC, MD, MG, MOC, AD, AG, AT (attaquant de soutien), BU (buteur).

### 5.2 Tiers et raretés

| Tier | Note | Correspondance | Rareté |
|---|---|---|---|
| **Bronze** | 40-64 | District | Commune / Rare |
| **Argent** | 65-74 | Régional | Commune / Rare |
| **Or** | 75-82 (base) | National 1-2, stars régionales | Commune / Rare |
| **Spéciales** | jusqu'à 95 | Promos, événements, légendes | Selon la promo |

**Plages de note par division** (le recouvrement est voulu : la star d'un D1 peut dépasser un joueur moyen de R3) :

| Division | Note de base |
|---|---|
| District bas (D4, D5 et au-delà) | 42-55 |
| District haut (D1 à D3) | 50-64 |
| R3 / R4 | 58-67 |
| R2 | 62-70 |
| R1 | 66-74 |
| N2 | 70-78 |
| N1 | 74-82 |

« Rare » = design brillant et probabilité plus faible en pack, mêmes règles de note.

### 5.3 Cartes spéciales (promos et événements)

| Carte | Déclencheur | Effet |
|---|---|---|
| **Onze du week-end** | Meilleurs joueurs de la journée, par district, ligue et au niveau national | Version boostée (+3 à +6), disponible en packs pendant 1 semaine |
| **Homme du match** | Performance réelle marquante (déclarée par le club au lancement officiel) | +1 à +3, carte dynamique |
| **Buteur du mois** | Meilleur buteur du mois par ligue | Carte TIR boostée |
| **Épopée Coupe de France** | Clubs amateurs qui vont loin en Coupe de France | Cartes qui **montent à chaque tour franchi en vrai** (dynamiques) |
| **Montée** | Équipes promues en fin de saison | Upgrade au tier supérieur |
| **Derby** | Week-ends de derbies réels | Cartes à collectifs spéciaux entre les deux clubs |
| **Ancien pro** | Anciens professionnels qui jouent en amateur (phénomène réel) | Carte au design distinct, stats mentales élevées |
| **Légende locale** | Grandes figures historiques d'un club, nommées par le club (accord obligatoire) | Équivalent des « icônes » : cartes très rares, 3 versions (début, apogée, fin) |
| **Trêve hivernale** | Événement de décembre | Cartes à thème, défis spéciaux |
| **Évolution** | Créées par le joueur (§6.5) | Cartes améliorées via des défis |
| **Fondateurs** | Les premiers inscrits au lancement | Cosmétique, non échangeable |

### 5.4 Génération procédurale des joueurs fictifs

Un **générateur déterministe** (graine = identifiant du club + saison) produit des effectifs crédibles :

1. **Effectif** : 20-25 seniors par équipe fanion (répartition réaliste des postes : 2-3 G, 7-8 défenseurs, 6-7 milieux, 4-5 attaquants).
2. **Identité** : prénoms et noms tirés de distributions réalistes pour la France (listes publiques de prénoms par décennie de naissance, noms fréquents par région). **Vérification de non-collision** : pas de correspondance exacte avec un vrai licencié du club au lancement.
3. **Note de base** : tirée dans la plage de la division, avec une courbe en cloche et quelques « pépites ».
4. **Archétype selon le poste**, qui répartit les points :
   - Gardien : *Mur* (réflexes), *Libéro* (jeu au pied), *Chat* (plongeon)
   - Défense : *Patron* (DÉF, PHY), *Relanceur* (PAS), *Latéral piston* (VIT, endurance)
   - Milieu : *Sentinelle*, *Box-to-box*, *Meneur* (vision, PAS), *Pitbull* (agressivité)
   - Attaque : *Ailier percutant* (VIT, DRI), *Renard des surfaces* (placement, finition), *Pivot* (PHY, tête), *Faux 9*
5. **Courbe d'âge** : 18-40 ans. Après 32 ans, VIT baisse, placement et vision augmentent (trait *Vétéran* probable après 35 ans).
6. **Traits** tirés avec des probabilités (§5.5).
7. **Physique et apparence** de l'avatar : paramètres pour le moteur 3D (carnation, coiffure, pilosité, morphologie) générés pour un casting divers et réaliste.

### 5.5 Traits

Visibles sur la carte. Certains sont **cachés** jusqu'à ce qu'on joue un match avec le joueur (petite découverte qui fait sourire).

| Trait | Type | Effet dans le moteur |
|---|---|---|
| **Poumon** | + | Endurance quasi illimitée, pressing tout le match |
| **Renard des surfaces** | + | Bonus de placement et de finition dans la surface |
| **Frappe de mule** | + | Puissance de frappe accrue, cône de précision plus large |
| **Patron de la défense** | + | Bonus de marquage aux défenseurs voisins |
| **Coiffeur** | + | Jeu de tête supérieur, domination sur corners |
| **Tireur de coups de pied arrêtés** | + | Précision et effet sur coups francs et corners |
| **Capitaine** | + | Bonus de moral collectif, réduit l'effet d'un but encaissé |
| **Magicien** | + | Gestes techniques débloqués dans les actions clés |
| **Ancien pro** | + | Sang-froid, vision, calme dans les moments décisifs |
| **Diesel** | ± | Plus faible en début de match, plus fort en 2e mi-temps |
| **Vétéran** | ± | −VIT, +placement, +vision |
| **Troisième mi-temps** | ± | −endurance, +moral d'équipe |
| **Chambreur** | ± | Déstabilise son adversaire direct, mais risque de carton |
| **Râleur** | − | Probabilité accrue de carton jaune |
| **Pied carré** | − | Pied faible à 1★ garanti |
| **Arrivé à 14h58** | − | Malus les 10 premières minutes |
| **Frileux** | − | Malus sous la pluie et sur terrain gras |

Les traits négatifs rendent les cartes **attachantes et moins chères** : ils créent des choix intéressants dans la construction d'équipe.

### 5.6 Autres types de cartes
- **Entraîneur** : bonus de collectif pour son club ou son district, style tactique préféré.
- **Arbitre** (consommable humoristique) : *Strict* (plus de cartons), *Laxiste* (plus de fautes non sifflées), *Myope*… appliqué au prochain match.
- **Stades** (cosmétiques) : ton terrain à domicile (herbe, synthétique, stabilisé, nocturne, terrain en pente…).
- **Maillots, ballons, célébrations, effets de carte** (cosmétiques).
- **Consommables de match** : *Remontée de bretelles à la mi-temps* (boost de moral), *Plan de jeu du coach* (bonus tactique sur un match).

### 5.7 Réclamer sa carte (lancement officiel)
1. Le joueur crée un compte et cherche son club.
2. Il réclame une carte existante (si son club a été importé) ou demande sa création.
3. **Validation** : par un **dirigeant vérifié** du club (Espace Club) **ou** par **3 coéquipiers déjà validés**.
4. Il choisit sa photo (modérée) ou un avatar, son surnom, son numéro, son poste.
5. **Stats** : générées à partir de sa division et de son poste, puis ajustées par les **notes de ses coéquipiers** (§5.8).
6. Consentement explicite et révocable à tout moment (retrait immédiat de la carte en circulation, remplacée par un joueur fictif).

### 5.8 Notes des coéquipiers
- Chaque joueur validé peut noter ses coéquipiers sur les 6 axes (une fois par phase de saison).
- Les notes sont **pondérées** (ancienneté, cohérence), **plafonnées** (la note finale reste dans la plage de la division, ±4 max par rapport à la base) et **anti-abus** (détection des votes groupés, minimum de votants).
- Résultat : des cartes qui **vivent** et qui génèrent des discussions (et du chambrage) dans le vestiaire.

---

## 6. Construction d'équipe

### 6.1 Onze et banc
- 11 titulaires + 7 remplaçants + réserve.
- **Formations** : 4-4-2, 4-3-3 (3 variantes), 4-2-3-1, 4-1-2-1-2 (losange), 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-5-1.
- Poste principal = 100 % d'efficacité, poste secondaire = 95 %, poste proche = pénalité croissante.

### 6.2 Collectifs (équivalent des « liens »)
Chaque joueur gagne de **0 à 3 points de collectif** selon le nombre de joueurs de l'onze qui partagent :
- **Même club** : 2 joueurs → +1, 4 → +2, 7 → +3
- **Même district** : 3 → +1, 5 → +2, 8 → +3
- **Même ligue** : 3 → +1, 5 → +2, 8 → +3
- **Même division** (bonus secondaire) : 4 → +1

Le meilleur des trois compte (club, district, ligue), plafonné à 3 par joueur, **33 pour l'équipe**. Un joueur hors de son poste n'apporte **aucun** collectif. L'**entraîneur** ajoute +1 aux joueurs de son club ou district.

Les collectifs se traduisent en bonus d'attributs dans le moteur (jusqu'à +5 sur les stats clés du poste) et en fluidité des enchaînements dans la simulation.

### 6.3 Note d'équipe
Moyenne pondérée des notes des titulaires (formule proche des standards du genre : moyenne des 11 + correction pour les notes au-dessus de la moyenne), affichée en permanence. Sert au matchmaking et aux défis.

### 6.4 Tactiques
- **Mentalité** : ultra-défensive → ultra-offensive (5 crans)
- **Style de jeu** : possession, contre-attaque, jeu long, pressing haut, bloc bas
- **Largeur**, **hauteur de la ligne défensive**, **intensité du pressing**
- **Instructions individuelles** : rester en défense, se projeter, couper vers l'intérieur, cibler en profondeur…
- **Tireurs désignés** : penalty, coups francs, corners, capitaine

### 6.5 Évolutions
Le joueur choisit une carte éligible (ex. : « bronze, VIT < 70 ») et remplit des objectifs de match avec elle (« marquer 3 buts sur des actions clés ») en payant des crédits. La carte monte d'un palier. **Excellent puits de crédits et moteur d'attachement** aux cartes modestes.

---

## 7. Le match

### 7.1 Vue d'ensemble

Un match dure **3 à 5 minutes réelles** (vitesse réglable, option « simulation rapide »).

1. **Avant-match** : compos, météo et terrain annoncés, arbitre, cote du match.
2. **Simulation 2D** vue de dessus : pions aux couleurs des maillots, numéros, ballon, flèches de passes, fil de commentaires.
3. **Actions clés** : 3 à 6 par match (selon la domination), le jeu **bascule en 3D**.
4. **Mi-temps** : stats, changements tactiques, remplacements, consommables.
5. **Fin de match** : note des joueurs, homme du match, récompenses, **ralenti partageable du plus beau but**.

### 7.2 Moteur de simulation (vue design)
- Le terrain est découpé en **zones** (couloirs × bandes). Le jeu avance par **phases** (~100-140 par match).
- Chaque phase résout des **duels** (passe vs interception, dribble vs tacle, centre vs tête, frappe vs gardien) à partir des attributs, des collectifs, de la tactique, de la fatigue, des traits, de la météo et du terrain.
- Les **actions clés** sont déclenchées quand une phase atteint une situation à fort enjeu (occasion franche, coup franc bien placé, penalty, face-à-face, contre-attaque en surnombre). Les situations défensives importantes le sont aussi.
- **Déterministe** à partir d'une graine : le serveur peut rejouer et valider tout match (anti-triche, replays).

### 7.3 Conditions de jeu

| Condition | Effet |
|---|---|
| **Pelouse** | Neutre |
| **Synthétique** | Ballon plus rapide, avantage au jeu court |
| **Terrain gras / boue** | −VIT, −DRI, ballon qui freine, glissades, avantage aux costauds |
| **Stabilisé** | Rebonds aléatoires, malus contrôle |
| **Pluie** | Gardiens moins sûrs, frappes lointaines dangereuses |
| **Vent** | Dévie les ballons aériens (visible en 3D) |
| **Nocturne** | Aucun effet de jeu, ambiance projecteurs |
| **Terrain en pente** (easter egg) | Avantage à l'équipe qui attaque « en descente » |

### 7.4 Actions clés en 3D (façon *Score! Hero*)

**Principe** : la situation est reconstituée en 3D à partir de la position des joueurs dans la simulation. Le joueur **trace une trajectoire** (doigt ou souris) ; les coéquipiers courent automatiquement ; les défenseurs et le gardien réagissent selon leurs stats.

**Types d'actions offensives :**
| Type | Geste |
|---|---|
| **Attaque placée** | 1 à 3 passes tracées puis une frappe (chaîne façon *Score! Hero*) |
| **Contre-attaque** | Choix de la passe en profondeur au bon moment, puis frappe |
| **Face-à-face** | Frappe, piqué ou dribble du gardien (glisser selon le geste) |
| **Coup franc direct** | Trajectoire avec effet par-dessus le mur |
| **Corner / centre** | Tracer le centre, choisir la reprise (tête, volée) |
| **Penalty** | Viser, doser (jauge), avec la pression du public |

**Types d'actions défensives :**
| Type | Geste |
|---|---|
| **Arrêt du gardien** | Glisser dans la direction du plongeon au bon moment |
| **Tacle décisif** | Tap au bon timing (jauge) |
| **Mur sur coup franc** | Tap pour faire sauter le mur |

**Comment les stats pèsent sur le geste :**
- **Précision** (finition, passes) → taille du **cône d'erreur** autour de la trajectoire tracée
- **Puissance** → portée et vitesse maximales
- **Effet / technique** → courbure maximale autorisée
- **Pied faible** → cône élargi si le joueur frappe du mauvais pied
- **VIT** des coureurs → qui arrive en premier sur le ballon
- **Gardien** → rayon d'action, temps de réaction, probabilité de capter ou de repousser
- **Sang-froid / traits** → réduction du tremblement de la trajectoire sous pression (penalty à la dernière minute)

**Mise en scène (la signature visuelle) :**
- **Caméra cinématique** : plan d'intention (derrière le porteur), plan de suivi du ballon, plan latéral pour les frappes, plan inversé depuis le but pour les arrêts
- **Ralenti** (bullet time) à l'impact, arrêt sur image de 2-3 images (hit-stop) sur les frappes puissantes
- **Traînée du ballon** colorée selon la puissance, flou de mouvement, profondeur de champ
- **Filet qui se déforme**, secousse de caméra, flash, confettis de la tribune… d'une tribune d'une trentaine de personnes
- **Célébrations** (déblocables, cosmétiques) : genou à terre, glissade, « le téléphone », course vers la buvette
- **Replay automatique** du but sous un autre angle
- **Échec humoristique** : frappe dans les arbres, le ballon atterrit dans le jardin du voisin, un chien traverse le terrain

**Résolution** : le résultat (but, arrêt, poteau, corner, contre) est réinjecté dans la simulation. Option **« auto-résolution »** (accessibilité ou simulation rapide) : le moment est résolu par les stats seules, avec un résultat légèrement moins bon en moyenne qu'une exécution réussie.

### 7.5 Commentaires
- Commentateur façon **speaker du club**, textes générés à partir de gabarits riches et variés (plusieurs centaines de phrases), avec de l'humour : « Frappe dans les arbres, qui va chercher le ballon ? », « L'arbitre n'a rien vu, comme d'habitude ».
- Plus tard : voix synthétique optionnelle.

### 7.6 Fatigue, cartons, bobos
- Endurance qui baisse pendant le match, influencée par le pressing et les traits.
- Cartons jaunes et rouges (suspension au match suivant en Carrière).
- « **Petits bobos** » : un joueur peut sortir en cours de match, mais **pas de blessures longues** (frustration inutile).
- **5 remplacements** par match.

---

## 8. Modes de jeu

### 8.1 Carrière — « De District 5 à National 1 » (solo)
- Tu démarres dans un championnat de District 5 **réel** (les autres équipes sont de vrais clubs du district, avec des effectifs générés).
- Saisons courtes (10-14 journées), **montées et descentes**, coupes départementales et régionales, **Coupe de France** (tours préliminaires jusqu'au rêve d'affronter un pro fictif).
- Objectif long terme : atteindre le National 1. Récompenses à chaque montée.
- Mode de progression principal pour débuter.

### 8.2 Défis de création d'équipe (DCE)
Tu échanges des cartes contre une récompense en respectant des contraintes :
- « **Derby des Flandres** » : 11 joueurs de deux clubs rivaux
- « **100 % District** » : aucune carte au-dessus de 64
- « **Tour de ligue** » : 5 districts différents minimum
- « **Collectif parfait** » : 33 points de collectif
- Défis de **club** : complète l'effectif de ton club pour gagner une carte exclusive
- DCE « **Légende locale** » : échange des cartes de valeur pour débloquer une légende

Les DCE sont le **principal puits de cartes** de l'économie.

### 8.3 Championnat en ligne (PvP asynchrone)
- Tu affrontes l'équipe d'un autre joueur, contrôlée par l'IA (il n'a pas besoin d'être connecté).
- **Divisions** nommées comme la pyramide réelle : District 5 → … → R1 → N2 → N1 → **Élite**.
- Points par semaine, montées et descentes, récompenses hebdomadaires selon la division.

### 8.4 Le Dimanche (PvP en direct, événement phare)
- **Chaque dimanche**, un tournoi en direct ouvert à 15h (l'heure mythique des matchs amateurs) pendant plusieurs heures.
- Les deux joueurs sont connectés : simulation partagée et **actions clés en duel simultané**. Quand l'un attaque et trace sa frappe, **l'autre choisit en même temps le plongeon de son gardien**. Résolution par le serveur.
- Nombre de matchs limité (ex. : 10), récompenses selon le bilan.

### 8.5 Coupe (événements)
- Tournois à élimination directe calqués sur la **Coupe de France** (tours réels) ou des coupes régionales. Récompenses croissantes.

### 8.6 Tirage (draft)
- Tu construis une équipe à partir de choix aléatoires (5 propositions par poste), puis tu enchaînes 4 matchs. Récompenses selon les victoires. Coût d'entrée en crédits ou en ticket.

### 8.7 Amicaux
- Contre un ami (asynchrone ou en direct), sans enjeu, pour chambrer.

### 8.8 Mon Club (social)
- Chaque joueur peut rejoindre la **communauté de son vrai club** (vérifiée au lancement officiel).
- **Classement des clubs** : au niveau du district, de la ligue et national, sur l'activité et les résultats de leurs membres dans le jeu. « Quel club du Pas-de-Calais a la meilleure communauté ? »
- Objectifs collectifs de club, fil d'actualité, derbies entre communautés.

---

## 9. Économie

### 9.1 Monnaies
- **Crédits (CR)** : monnaie unique du jeu, **uniquement gagnée en jouant**. Jamais achetable avec de l'argent réel.
- **XP de saison** : fait progresser le passe de saison.
- *(Lancement officiel)* : aucune monnaie premium qui achète des packs. Voir §9.6.

### 9.2 Sources de crédits (valeurs de départ, à équilibrer par simulation)

| Source | Crédits |
|---|---|
| Victoire en Carrière | 300 (District) → 900 (N1) |
| Nul / défaite | 50 % / 25 % de la victoire |
| Action clé réussie | +25 |
| Objectifs quotidiens (3/jour) | ~1 500 / jour |
| Objectifs hebdomadaires | Packs + 5 000 |
| Championnat en ligne (hebdo) | 2 000 → 40 000 selon la division |
| Le Dimanche | Packs + 5 000 → 60 000 |
| Vente rapide | Valeur système de la carte |

**Cible** : un joueur actif (≈ 45 min/jour) gagne **6 000 à 9 000 CR par jour**, soit environ un pack premium tous les 1,5 à 2 jours.

### 9.3 Puits de crédits
- Packs
- Taxe de **5 %** sur les ventes du marché
- Évolutions
- Frais d'entrée (Tirage, certains tournois)
- DCE (qui consomment des cartes, donc de la valeur)
- Cosmétiques achetables en crédits

### 9.4 Packs

| Pack | Prix | Contenu |
|---|---|---|
| Pack Bronze | 400 CR | 12 cartes bronze, 1 rare garantie |
| Pack Argent | 2 000 CR | 12 cartes argent, 1 rare garantie |
| Pack Or | 5 000 CR | 12 cartes dont 3 or minimum |
| Pack Or Premium | 10 000 CR | 12 cartes or dont 3 rares |
| Pack Méga | 25 000 CR | 30 cartes or dont 6 rares |
| Packs promo | Variable | Probabilités renforcées de cartes spéciales |
| Pack Club | Récompense | Joueurs d'un club précis |

- **Probabilités affichées** pour chaque pack, avant l'achat.
- **Valeur moyenne** d'un pack en vente rapide : 40 à 60 % de son prix (standard du genre, à valider par simulation).
- **Tirage exclusivement côté serveur**.

### 9.5 Marché des transferts
- **Enchères** et **achat immédiat**, durées : 1h, 3h, 12h, 24h, 3 jours.
- **Taxe** de 5 % sur chaque vente.
- **Fourchettes de prix** min/max par carte, recalculées selon la cotation (anti-blanchiment, anti-vente en dehors du jeu).
- 50 annonces simultanées max, liste de suivi, **historique des prix avec graphique**, alertes.
- **Échanges directs** : entre amis uniquement, écart de valeur limité, 5 par jour, cartes « non échangeables » exclues.
- **Détection** des comportements de bots et des transferts de valeur entre comptes liés.

### 9.6 Monétisation (lancement officiel, jamais pay-to-win)
1. **Cosmétiques** : stades, maillots, célébrations, effets de carte, animations d'ouverture
2. **Passe de saison** : piste gratuite + piste premium **cosmétique uniquement**
3. **Offre Club** (abonnement pour les clubs) : page officielle personnalisée, logo officiel, outils de communication (visuels de match, annonces de composition), statistiques de la communauté
4. **Cartes physiques** : impression à la demande de sa carte ou de l'effectif du club (packs vendus par le club pour se financer, avec une part pour le club)
5. **Sponsoring hyperlocal** : les commerces locaux sponsorisent les maillots virtuels et les panneaux du stade d'un district (le « Boulangerie Dupont » devient réel)
6. **Partenariats** : districts, ligues, équipementiers

---

## 10. Progression et rétention

- **Onboarding** : choix du club de départ (ou de son vrai club), pack de bienvenue, premier match guidé avec une action clé scénarisée. **Objectif : premier but en moins de 3 minutes.**
- **Objectifs** quotidiens, hebdomadaires, de saison, de club
- **Passe de saison** gratuit (crédits, packs, cartes) + cosmétique
- **Collection** : albums par club, district, ligue et promo avec récompenses de complétion (effet album Panini)
- **Calendrier live-ops** calé sur la vraie saison : reprise (août), Toussaint, trêve (décembre-janvier), Coupe de France (janvier-avril), fin de saison et montées (mai-juin), mercato d'été (juillet)
- **Notifications push** (PWA, avec consentement) : vente sur le marché, tournoi du dimanche, nouvelle carte de ton club

---

## 11. Social et viralité

- **Carte partageable** : chaque carte a une URL publique avec un visuel automatique (réseaux sociaux, messageries). Format story 1080×1920 exportable.
- **Partage de but** : export vidéo du ralenti (généré depuis le rendu 3D) → TikTok, Instagram, WhatsApp du vestiaire
- **« Réclame ta carte »** : lien partageable à un coéquipier
- **Pages club publiques** : effectif en cartes, classement, légendes
- **Chambrage intégré** : réactions sur les cartes des coéquipiers, défi amical en un clic
- **Classements** : joueurs, clubs, districts, ligues

---

## 12. Direction artistique

### 12.1 Positionnement
**Premium et flatteur dans l'interface et les cartes, authentique et drôle dans les détails.** On traite le foot du dimanche avec le prestige de la Ligue des champions.

### 12.2 Univers visuel
- **Ambiances** : soir sous les projecteurs, fin d'après-midi dorée, terrain gras d'hiver, brume sur le synthétique
- **Motifs** : lignes de craie, filets, grillages, main courante blanche, tribune en tôle, préfabriqué-vestiaire, buvette
- **Palette** (à affiner) : vert pelouse nocturne profond, blanc craie, jaune/orange projecteur en accent, métaux (bronze, argent, or) pour les tiers
- **Typographie** : une display condensée très forte pour les notes et les noms (pistes libres : *Big Shoulders Display*, *Barlow Condensed*, *Anton*) + une sans-serif lisible pour l'interface (*Inter*, *Manrope*)

### 12.3 Les cartes
- Esprit **vignette Panini des années 90** croisé avec le rendu holographique moderne
- Cadres distincts par tier (bronze mat, argent satiné, or brillant), **reflets holographiques** en 3D qui suivent le gyroscope ou la souris
- Chaque promo a sa propre identité (Onze du week-end : noir et or ; Épopée Coupe de France : bleu-blanc-rouge…)

### 12.4 Ouverture de pack (le « walkout » amateur)
1. Le pack se déchire (reprise et adaptation du moteur de **Carte du Ciel**)
2. Pour une bonne carte : séquence de révélation progressive → **drapeau de la ligue** → **blason du club** → **poste** → **la carte** dans un halo de projecteur
3. Variantes humoristiques pour les petites cartes (le projecteur grésille, un chien traverse)
4. Son : sifflet, clameur, ballon sur la tôle

### 12.5 La 3D des actions clés
- Personnages **low-poly stylisés** (lisibles, performants, cohérents), maillots paramétriques (couleurs, motifs, sponsor, numéro générés par shader)
- **Un stade amateur modulaire** décliné en variantes (surfaces, météo, heure, tribune), arbres, maisons autour, parking
- Petite foule instanciée (30 à 300 personnes selon le niveau), chien, bénévole à la buvette

### 12.6 Son
Sifflets, frappes (différentes selon la surface), filet, tôle, clameurs locales, speaker, musiques d'interface énergiques. Réglages séparés (musique, effets, commentaire).

### 12.7 Accessibilité
Modes daltonisme, réduction des mouvements de caméra et des flashs, auto-résolution des actions clés, taille de texte, contrôle au clavier sur desktop, contrastes AA.

---

## 13. Back-office (lancement officiel)

- **Contenu** : création de promos, cartes spéciales, DCE, packs (contenu et probabilités), objectifs, événements, saisons
- **Économie** : tableaux de bord (masse de crédits, inflation, prix du marché, taux d'ouverture), outils d'ajustement
- **Modération** : photos, surnoms, signalements, bannissements
- **Validation des réclamations** de cartes, gestion des clubs et des dirigeants vérifiés
- **Support** et journal d'audit

---

## 14. Nom et marque

**Décision (27/09/2026) : Légendes du Dimanche.** Aucun jeu existant sous ce nom trouvé lors d'une recherche rapide ; « Onze du Dimanche » a été écarté (trop proche d'« Onze de Rêve », jeu de draft de foot français existant).

**Pistes étudiées :**
| Nom | Pour | Contre |
|---|---|---|
| ~~Main Courante~~ (ancien nom de code) | Iconique du foot amateur, original, court | Moins parlant hors du milieu du foot |
| **Dimanche 15h** | Tout licencié comprend immédiatement, relié au mode phare | Moins « marque » |
| **Légendes du Dimanche** ✅ retenu | Parle tout de suite aux joueurs : la fierté (« ma carte, une légende ») et le foot amateur (« le dimanche ») ; colle au pilier n° 1 et au mode « Le Dimanche » | Un peu long : abréviation « LDD » ou « Légendes » en interface compacte |
| **Division d'Honneur** | Nostalgie (ancien nom de la R1) | Parle surtout aux plus de 30 ans |

**Interdits** : « FIFA », « FUT », « Ultimate Team », « EA », « FC » en tant que marque de jeu, logos FFF, ligues ou clubs sans accord. Vérifier le nom retenu à l'**INPI** et la disponibilité des noms de domaine et des comptes sociaux avant de le figer.

---

## 15. Indicateurs de succès

**Portfolio** : taux de complétion de la tranche verticale, temps jusqu'au premier but, retours qualitatifs (recruteurs, communauté), vues de l'étude de cas, partages.

**Produit** : rétention J1/J7/J30, packs ouverts par jour, actions clés jouées vs auto-résolues, taux de partage, **taux de réclamation de cartes par club**, nombre de clubs avec plus de 10 joueurs actifs, participation au Dimanche.

---

## 16. Questions ouvertes

- Nom définitif et identité visuelle.
- Rythme exact des saisons (6 ou 8 semaines).
- Profondeur du mode Carrière pour la tranche verticale (une saison complète ou quelques journées).
- Partenariat officiel à rechercher (Ligue des Hauts-de-France, districts) avant ou après le lancement public.
- Voix du commentateur : texte seul ou synthèse vocale.
