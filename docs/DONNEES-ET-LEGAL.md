# Légendes du Dimanche — Données et cadre légal

> Complément du [GDD](./GDD.md). Version 1.0 — 27 septembre 2026.
> ⚠️ Ce document est une base de travail, **pas un avis juridique**. Avant le lancement public, faire valider les points marqués ⚖️ par un avocat (droit du numérique / données personnelles).

---

## 1. Principe directeur

**Aucune donnée personnelle d'un vrai joueur n'entre dans le jeu sans son consentement explicite.**
Le monde est peuplé de joueurs fictifs ; les vrais joueurs **choisissent** d'y entrer. Ce n'est pas qu'une contrainte : c'est le moteur de viralité (« réclame ta carte »).

---

## 2. Sources de données

### 2.1 Ce qu'on utilise

| Donnée | Source | Usage | Phase |
|---|---|---|---|
| Structure de la pyramide (ligues, districts, divisions, poules) | Sites publics des ligues et districts (compilation manuelle ou semi-automatique, respect des CGU) | Univers du jeu | Portfolio |
| Noms des clubs, ville, division de l'équipe fanion | Idem (données factuelles sur des associations, pas des personnes) | Clubs du jeu (blasons générés) | Portfolio |
| Stades et surfaces de jeu | **Recensement des équipements sportifs** (open data du ministère des Sports, sur data.gouv.fr — vérifier la licence) | Nom du stade, type de surface (naturel, synthétique, stabilisé) | Portfolio |
| Communes, départements, géographie | geo.api.gouv.fr / INSEE / IGN (open data) | Rattachement géographique, cartes | Portfolio |
| Prénoms | Fichier des prénoms de l'INSEE (open data) | Génération crédible des joueurs fictifs | Portfolio |
| Noms de famille | Listes publiques de fréquence (à identifier, vérifier la licence) | Génération | Portfolio |
| Cartes de vrais joueurs | **Le joueur lui-même** (réclamation) ou son club (dirigeant vérifié, avec consentement du joueur) | Cartes réelles | Lancement officiel |
| Résultats réels (Onze du week-end, buteurs, épopées) | **Déclarations des clubs** (Espace Club) ; idéalement **partenariat** avec une ligue ou la FFF | Cartes dynamiques | Lancement officiel |

### 2.2 Ce qu'on n'utilise pas
- **L'API interne de la FFF (api-dofa)** : non publique, sans documentation officielle depuis 2024. Les feuilles de match (compositions, buteurs) sont fermées au public (erreur 401) depuis la cyberattaque de mars 2024. Les contournements par jeton récupéré ne doivent **pas** être utilisés (accès non autorisé, fragilité, risque juridique).
- **Transfermarkt, Flashscore et sites équivalents** : leurs CGU interdisent l'extraction automatisée, et leurs données contiennent des données personnelles.
- **Photos trouvées sur internet** (sites des clubs, réseaux sociaux, presse locale) : jamais.
- **Logos réels** des clubs, districts, ligues et de la FFF : jamais sans accord écrit.

### 2.3 Stratégie de partenariat (lancement officiel)
1. Démontrer la tranche verticale (portfolio) et l'engouement (liste d'attente, clubs volontaires).
2. Approcher la **Ligue de Football des Hauts-de-France** et 2-3 districts pilotes : valeur proposée = outil d'animation des licenciés, attractivité, financement des clubs (cartes physiques, sponsoring local).
3. Objectif : accès officiel aux données de compétition (calendriers, résultats) et droit d'utiliser les logos.
4. Sans partenariat, le jeu fonctionne quand même : structure publique + déclarations des clubs et joueurs.

---

## 3. RGPD ⚖️

### 3.1 Rôles
- **Responsable de traitement** : Lucas (auto-entreprise), puis la structure juridique créée pour le lancement.
- **Sous-traitants** (contrats de sous-traitance / DPA à signer) : Supabase (hébergement UE), Vercel, Fly.io, Sentry, PostHog (UE), service d'e-mails transactionnels.

### 3.2 Traitements

| Traitement | Données | Base légale | Conservation |
|---|---|---|---|
| Compte joueur | E-mail, pseudo, préférences, club suivi | Exécution du contrat (CGU) | Durée du compte + 1 an d'inactivité → suppression après préavis |
| **Carte d'un vrai joueur** | Nom, surnom, photo, club, poste, numéro, stats, notes des coéquipiers | **Consentement explicite**, spécifique, révocable | Jusqu'au retrait du consentement |
| Notes des coéquipiers | Notes chiffrées données et reçues | Consentement (participation volontaire) | Agrégées ; notes individuelles purgées après chaque phase |
| Sécurité et anti-triche | Journaux techniques, identifiants de session, signaux de fraude | Intérêt légitime | 12 mois max |
| Analytics | Événements d'usage | **Consentement** (bandeau conforme aux lignes directrices de la CNIL) | 13 mois max |
| Notifications push | Jeton d'abonnement | Consentement | Jusqu'au désabonnement |

### 3.3 Droits des personnes
- **En libre-service** dans les réglages : accès, export (portabilité), rectification, suppression du compte, retrait de la carte réelle.
- **Retrait d'une carte réelle** : effet **immédiat** — la carte disparaît de la circulation. Les exemplaires possédés par d'autres joueurs sont **convertis en joueur fictif** aux stats équivalentes (aucune perte de valeur pour eux).
- Contact dédié pour les demandes (réponse sous 1 mois).

### 3.4 Obligations
- **Registre des traitements**.
- **Analyse d'impact (AIPD)** fortement recommandée : l'évaluation de personnes par leurs pairs (notes des coéquipiers) à grande échelle rentre dans les critères de la CNIL.
- **Hébergement dans l'UE**, chiffrement en transit et au repos, principe du moindre privilège.
- **Violation de données** : notification à la CNIL sous 72 h, procédure écrite.
- **Privacy by design** : notes des coéquipiers uniquement chiffrées et agrégées (pas de commentaires libres publics), plafonnées, avec minimum de votants.

---

## 4. Droit à l'image ⚖️

- Toute photo d'un vrai joueur exige son **consentement écrit, spécifique** (usage dans le jeu, sur les pages publiques, dans les visuels de partage) **et révocable**.
- Photos **importées par la personne elle-même** (ou par un dirigeant avec une preuve de consentement), **modérées** avant publication (nudité, visages de tiers, contenus haineux).
- Alternative par défaut : **avatar stylisé** généré (aucune donnée biométrique).
- Pas de génération d'avatar « ressemblant » à partir d'une photo sans consentement.

---

## 5. Mineurs ⚖️

- **Aucune carte de joueur réel mineur. Jamais.** Les catégories jeunes sont exclues du jeu.
- **Joueurs fictifs** : tous majeurs (18 ans et plus).
- **Utilisateurs** : en France, la majorité numérique pour le consentement au traitement des données est fixée à **15 ans** (en dessous, accord parental requis). Recommandation au lancement : **inscription à partir de 15 ans**, à réévaluer avec un avocat (fonctions sociales, messagerie, textes récents sur la majorité numérique).
- Pas de messagerie libre entre inconnus (réactions prédéfinies uniquement) pour limiter les risques.

---

## 6. Propriété intellectuelle et marques ⚖️

| Élément | Règle |
|---|---|
| « FIFA », « FUT », « Ultimate Team », « EA SPORTS FC » | **Marques d'EA / de la FIFA : jamais utilisées** (ni dans le nom, ni dans le marketing, ni dans le code affiché). Les mécaniques de jeu ne sont pas protégeables, mais on ne copie pas la mise en page des cartes ni l'interface d'EA : notre design est original. |
| Logos de la FFF, des ligues, des districts, des clubs | Marques et droits d'auteur : **blasons générés** par le jeu ; logos officiels uniquement avec **accord écrit** (clubs partenaires). |
| Noms des clubs | Utilisation factuelle (référence à une association réelle), sans laisser croire à un partenariat. Mention visible : **« Jeu non officiel, non affilié à la FFF, aux ligues ou aux clubs. »** Retrait sur demande d'un club. |
| Nom du jeu | Recherche d'antériorité à l'**INPI** (classes 9, 28, 41 notamment) avant de le figer ; dépôt au lancement. |
| Polices | Vérifier la licence (web + usage commercial). Préférer les polices OFL (Google Fonts). |
| Animations Mixamo | Vérifier les conditions d'Adobe au moment de l'usage (historiquement libres de droits pour projets personnels et commerciaux). |
| Musiques et sons | Licences explicites (bibliothèques libres de droits ou créations originales). |

---

## 7. Packs, loot boxes et jeux d'argent ⚖️

### 7.1 Le cadre en 2026
- **France** : l'ANJ considère que les loot boxes classiques échappent à la définition légale des jeux d'argent. Le **cadre expérimental JONUM** (décret n° 2026-60 du 4 février 2026) vise les jeux à **objets numériques monétisables** (cessibles contre de la valeur, NFT, crypto) : déclaration préalable à l'ANJ, plafonds de dépenses.
- **Belgique** : les loot boxes payantes sont assimilées à des jeux de hasard (important pour une future extension belge).
- **PEGI** : depuis juin 2026, tout jeu proposant des objets aléatoires **payants** reçoit au minimum PEGI 16 (nouvelles classifications).
- **UE** : le futur Digital Fairness Act prévoit d'encadrer loot boxes, monnaies virtuelles et interfaces trompeuses (proposition attendue fin 2026).

### 7.2 Nos règles de conception (qui nous gardent hors de ces régimes)
1. **Aucun achat de packs, de crédits ou de cartes avec de l'argent réel.**
2. **Aucune conversion possible** des cartes ou crédits en argent réel, en crypto ou en NFT. Fourchettes de prix sur le marché et échanges directs limités pour décourager la revente hors du jeu ; CGU qui l'interdisent ; détection et sanctions.
3. **Monétisation uniquement cosmétique**, services aux clubs, cartes physiques et sponsoring (voir GDD §9.6).
4. **Probabilités affichées** pour chaque pack, prix clairs, pas d'interfaces trompeuses (compte à rebours artificiels, pression d'achat).
5. **Lots réels** (tournois avec récompenses physiques) : **validation juridique préalable** (règlement de jeu-concours, gratuité de participation).

---

## 8. Cadre commercial ⚖️

- **Phase portfolio** : l'auto-entreprise suffit (aucun revenu direct du jeu).
- **Lancement officiel avec revenus** : envisager une **société** (SAS/SASU) pour isoler la responsabilité (données personnelles à grande échelle, relations avec les clubs), et les obligations associées : TVA sur les services numériques, CGV pour les offres Club et les cartes physiques.
- Documents obligatoires : **mentions légales**, **CGU**, **politique de confidentialité**, **politique cookies**, CGV (si vente), règlement des tournois.

---

## 9. Checklist avant lancement public

- [ ] Nom vérifié à l'INPI, domaine et réseaux sociaux réservés
- [ ] Mentions légales, CGU, confidentialité, cookies rédigées et validées
- [ ] Registre des traitements et AIPD réalisés
- [ ] Contrats de sous-traitance (DPA) signés
- [ ] Parcours de consentement des cartes réelles testé (dont le retrait immédiat)
- [ ] Modération des photos et surnoms opérationnelle
- [ ] Âge minimum et parcours d'inscription validés
- [ ] Mention « jeu non officiel » visible, procédure de retrait pour les clubs
- [ ] Aucune voie d'achat de valeur aléatoire, aucune conversion en argent réel
- [ ] Procédure de violation de données écrite
- [ ] Accords écrits pour chaque logo officiel et chaque « Légende locale »

---

## Références

- [TeamOpenData — API de la FFF changée (2024)](https://teamopendata.org/t/api-de-la-fff-changee-et-impossibilite-dacceder-a-certaines-donnees/4501)
- [TeamOpenData — Open data football amateur](https://teamopendata.org/t/opendata-football-amateur-en-france/3659)
- [FFF — Record de licences (2023-24)](https://www.fff.fr/article/11776-la-fff-enregistre-un-record-de-licences.html)
- [District 65 — La Ligue 3 remplace le National au 1er juillet 2026](https://district-foot-65.fff.fr/simple/ligue-3-le-3eme-etage-du-football-francais-prend-enfin-forme/)
- [ANJ — Jeux à objets numériques monétisables (JONUM)](https://anj.fr/jeux-objets-numeriques-monetisables-jonum)
- [Légifrance — Décret n° 2026-60 du 4 février 2026](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053443861)
- [Loot box et PEGI 16 en 2026](https://shattered.io/fr/loot-box-pegi-16-france-2026/)
