// Names for the fictional players: first names by decade of birth and surnames of the Nord and
// of France. Written by hand from what is common in the region (mining-basin Polish and Italian
// families, Flemish and Picard names, French first names by decade, and the diversity of a
// present-day amateur squad), not copied from a registry. Listed most frequent first: the
// generator draws with a skew towards the front of each list.
//
// Rule 3 of CLAUDE.md: players are fictional. A first name and a surname drawn here can match a real
// person by chance; the game never claims otherwise, and real players only enter with consent.

export type BirthDecade = 1980 | 1990 | 2000;

const words = (text: string): readonly string[] => text.trim().split(/\s+/);

/** First names by decade of birth (the players are 18 to 40 in 2026: born 1986 to 2008). */
export const FIRST_NAMES: Readonly<Record<BirthDecade, readonly string[]>> = {
  1980: words(`
    Nicolas Julien Sébastien Jérémy Kévin Maxime Alexandre Thomas Guillaume Romain Anthony Mickaël
    Florian Benjamin David Jonathan Damien Cédric Ludovic Vincent Fabien Mathieu Grégory Steven
    Yannick Mehdi Karim Samir Rachid Sofiane Mounir Youssef Bruno Nuno Miguel Rafael Dimitri
    Loïc Stéphane Christophe Aurélien Franck Jordan Teddy Rudy Cyril Lucas Antoine Pierre
    Xavier Olivier Adrien Bastien Steeve Johan Gaëtan Jérôme Sylvain Ismaël Hakim Farid Anis
  `),
  1990: words(`
    Kévin Maxime Thomas Alexandre Julien Antoine Quentin Romain Lucas Florian Anthony Jordan
    Mathieu Dylan Benjamin Adrien Valentin Clément Bryan Corentin Yanis Mehdi Sofiane Karim
    Bilal Ilyes Nassim Amine Ryan Hugo Théo Baptiste Loïc Aurélien Steven Jérémy Rayan Mickaël
    Nathan Enzo Tom Guillaume Vincent Rémi Damien Dorian Kylian Cédric Axel Ludovic Léo
    Moussa Ousmane Ibrahima Samuel Nicolas Pierre Arthur Jules Louis Gabin Tanguy Gaëtan
  `),
  2000: words(`
    Lucas Théo Hugo Enzo Nathan Louis Mathis Ethan Tom Noah Gabriel Léo Raphaël Arthur Jules
    Maxence Timéo Yanis Rayan Ilyes Adam Aymen Ismaël Wassim Mohamed Nolan Evan Kylian Liam
    Clément Baptiste Valentin Quentin Dylan Bastien Corentin Rémi Axel Thibault Alexis Mathéo
    Sacha Ryan Elias Amir Bilal Souleymane Moussa Ibrahim Rodrigue Tiago Diogo Rúben Kacper Jakub
    Owen Malo Nino Lenny Tristan Antonin Florent Simon Robin Matteo Anas Yassine Kenzo Illan
  `),
};

/** Surnames of the region and of France, most frequent first. */
export const COMMON_SURNAMES: readonly string[] = words(`
  Dubois Lefebvre Leroy Moreau Fournier Girard Lambert Dupont Bertrand Roux Vasseur Caron
  Delattre Duhamel Dufour Mercier Carpentier Lemaire Leclercq Legrand Dumont Masson Boulanger
  Delannoy Deleplanque Dewaele Vandenbussche Vanderbeken Delcroix Descamps Ducrocq Duquesne
  Lecomte Lemoine Leblanc Lebrun Lepoutre Lesage Lenglet Leduc Hennebelle Delmotte Dassonville
  Mallet Marchand Martel Meunier Noël Petit Poulain Ponchel Prévost Renard Robert Rousseau
  Thomas Vincent Wattez Baudoin Blondel Bocquet Bonnet Boutry Brasseur Brunet Cambier Carlier
  Cattiaux Charlet Cordier Coquelle Crépin Cuvelier Debruyne Decoster Defrance Degroote Dehaene
  Delabre Delahaye Delange Delbecque Deldalle Delfosse Delhaye Deloffre Delvaux Demarcq Deprez
  Derycke Desmarets Desrousseaux Dewilde Dhondt Dolez Dourlens Dumortier Dupuis Durieux Dutoit
  Evrard Fauquette Flament Fontaine Francois Gallet Gambier Gaudin Gilleron Gosselin Gournay
  Hanotte Hautecoeur Herbaut Hochart Houzé Hubert Huyghe Joly Joos Jouglet Lacroix Ladent
  Lagache Laurent Lebas Lecerf Lecocq Leconte Ledoux Lefranc Lejeune Lemette Lengrand Leprêtre
  Leroux Lesne Lheureux Loyez Maes Maillard Marlière Martin Massart Mathieu Mazur Menu Meurisse
  Michaux Minet Moriaux Morel Muller Olivier Pagnier Parent Parmentier Pauwels Payen Pecqueur
  Petitprez Picque Pierre Plouvier Podevin Poirier Pottier Prouvost Quennesson Raoult Rembert
  Richard Rigaut Roger Rosier Salomé Sauvage Sergent Simon Tellier Tison Tribout Vandamme
  Vanhaecke Vasseur Verbeke Verhaeghe Vermeulen Vidal Vignon Wallet Warembourg Willems Wiart
`);

/** Names that reflect the families of the mining basin, of immigration and of overseas France. */
export const DIVERSE_SURNAMES: readonly string[] = words(`
  Kowalski Nowak Wawrzyniak Kaczmarek Mazurek Wojcik Zielinski Lewandowicz Sobczak Pawlak
  Rossi Bianchi Ferrari Romano Colombo Ricci Marino Greco Conti De-Luca Moretti Esposito
  Silva Santos Pereira Ferreira Oliveira Costa Rodrigues Martins Sousa Fernandes Carvalho Gomes
  Benali Bouzid Haddad Mansouri Belkacem Boukhari Chikhi Merabet Saidi Amrani Ziani Kaddour
  Bensaïd Slimani Bouchama Djebbar Hamidi Lakhdar Mebarki Naili Taleb Yahiaoui Zerrouki
  Traoré Diallo Camara Keita Sissoko Coulibaly Konaté Diarra Touré Bah Sow Fofana Cissé Dembélé
  Kamara Sylla Barry Ndiaye Diop Mbaye Gueye Fall Sarr Toko Mbemba Nzuzi Kabongo Mukendi
  Yilmaz Kaya Demir Çelik Şahin Aydin Öztürk Arslan Doğan Kılıç
  Nguyen Tran Lê Pham Hoang Vo Chau
`);
