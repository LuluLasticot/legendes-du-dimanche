# Sources of the world

What feeds `clubs-hdf.csv` and the reference tables, and what does not. Rules: `docs/DONNEES-ET-LEGAL.md` §2.

## Used

| Data                                                                                                                                        | Source                                                                                                                                                                            | Terms                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Clubs of the Escaut district (343 registered): name, commune, postal code, kit colours, grounds and their surface                           | FFF competition API, `/api/clubs?cdg.cg_no=89`, **saved by hand by Lucas from his own browser on 2026-09-30**                                                                     | Undocumented API, see below |
| Division of each club's men's senior team (R1 to R3, Escaut D1 to D6): 28 + 48 + 96 + 24 + 36 + 40 + 60 + 70 + 99 engagements               | Same API, `/api/engagements?competition.cp_no=…` for the competitions 452054, 452055, 452056 (R1 to R3), 455272, 455280, 455298, 455300, 455301, 455302 (D1 to D6), saved by hand | idem                        |
| District numbers (Aisne 119, Artois 88, Côte d'Opale 92, Escaut 89, Flandres 90, Maritime Nord 91, Oise 120, Somme 121) and the league (87) | Same API, `/api/cdgs`                                                                                                                                                             | idem                        |
| National 1 / National 2 clubs of the Hauts-de-France outside the district (`national-extras.csv`), and Saint Amand FC                       | Wikipédia, « Championnat de France de football de quatrième / cinquième division 2026-2027 »                                                                                      | CC BY-SA 4.0                |
| Communes and INSEE codes (`hdf-communes.json`)                                                                                              | geo.api.gouv.fr                                                                                                                                                                   | Licence Ouverte 2.0         |

**How the file was made.** `scripts/import-fff-export.ts` reads the JSON files saved in a local folder and
writes `clubs-hdf.csv`. It never calls the network. A club goes in when it has a men's senior team in the
listed divisions, its division is the highest of its teams, and its colours and ground come from its file.
The raw files hold names and contacts of club officials (personal data): **they are never committed**,
only the club-level facts reach the CSV.

**The FFF API.** It is public in the sense that a browser can open it, but it has no documentation,
no licence, and since June 2026 a bot-detection firewall that refuses programs (checked twice: HTTP 403).
Here a person saved a few dozen files by hand. Club names, divisions, colours and grounds are facts about
associations, not personal data, but the terms of use are unclear ⚖️: **ask the league and the district
for an official access** (`docs/courriers/demande-acces-donnees.md`) before the public launch, and be
ready to replace this file with a licensed source.

### What is not known

- **Kit patterns** (stripes, hoops…): not in any file. Clubs with known colours get a plain kit; the others
  a guess, marked `guess`.
- **Clubs of other districts** in Régional 1 to 3: only the Escaut clubs are in the list.
- **Clubs without a men's senior team** (youth, futsal, women only): left out.
- **Year of foundation**: not in the files.
- Every line is `verified = non` until a person has read it.

## Not used (and why)

- **The FFF's competition API** (`api-dofa.fff.fr`), its successor `epreuves.fff.fr` and the FFF
  district and league sites: not public, protected by a bot-detection firewall (Akamai) since June 2026. Tried on 2026-09-29 with one plain request per address: **HTTP 403**. The only ways in described
  online are workarounds with automated browsers: not used.
- Transfermarkt, Flashscore and similar: terms forbid automated extraction.
- Any logo or photo found online.
- Summaries of web pages produced by a language model: they mix up leagues and invent lines. A line
  of the CSV comes from a file a person saved, or from a data file parsed by a script.
- Any program calling the FFF's servers: only files saved by hand from a browser are read.
