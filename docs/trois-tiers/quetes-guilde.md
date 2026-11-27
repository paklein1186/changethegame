# Quêtes de la guilde pour troistiers.space (fonction `guild-quests`)

```
GET /functions/v1/guild-quests?guild_id=4964c699-4684-43a9-b508-cee21c77e24e
Authorization: Bearer <jeton de la personne>   (facultatif)
```

- **Sans jeton** (page publique « Projets » du site) : quêtes de la guilde, propres ou affiliées, publiées, non
  supprimées, réglées sur **Public** dans « Web visibility », non masquées, **et ouvertes à tous** (accès
  « Transparence complète »). Champs : titre, description, nature, statut, image, adresse du site (`website_url`),
  étiquettes, dates, lien vers la quête. Jamais de budget, de cagnotte, de récompense ni de personne.
- **Avec le jeton d'une personne connectée** (membre, accompagnant…) : `mode: "member"`. Les quêtes publiées et non
  masquées que **cette personne** peut voir selon les règles d'accès de changethegame, même si elles ne sont pas
  exposées sur le web. Chaque quête porte `access` :
  - `"full"` : la personne voit tout (mêmes champs que le mode public) ;
  - `"teaser"` : elle ne voit que la fiche (titre, résumé, nature, statut, image, étiquettes) ; afficher un bouton
    « Demander l'accès » vers `request_access_url` (page de la quête sur changethegame, demande ouverte). Les admins
    de la quête y sont prévenus, accordent ou refusent, et peuvent retirer l'accès plus tard.
  Une quête que la personne ne doit pas voir n'est pas renvoyée. Le site n'a aucune règle à refaire : c'est
  changethegame qui décide, à chaque appel (réponse `private, no-store`).
- **Avec le jeton d'un·e admin de la guilde** (liaison à la main sur le site) : toutes les quêtes non supprimées,
  brouillons et quêtes privées compris, avec leurs réglages de visibilité et d'accès (`access_mode`). Les admins des
  entités qui administrent la guilde sont admins aussi.

Qui voit une quête suit le contrat commun avec le site (troistiers-site, `docs/quetes/visibilite.md`) :
`public` (tout le monde voit tout) ou `members` à partir d'un niveau, **N2** (adhésion active) ou **N3** (rôles ou
formules de membrane, selon la table N3 de la guilde) : ce niveau voit la **fiche**, le **contenu** reste à l'équipe
de la quête (participants, accès personnels) et à ses admins. Réglages sur changethegame : Paramètres de la guilde →
« Quest Access & Co-admins » (réglage par défaut et table N3), Paramètres de la quête → onglet **Access** (s'écarter
du défaut, demandes, accès personnels avec date de fin facultative).

Pour qu'une quête apparaisse sur le site : Paramètres de la quête → onglet Web → **Public**.

Le filtre est fait côté serveur ; la base applique les mêmes règles d'accès (politiques sur les quêtes et leur contenu).
Remarque : `site-feed` ne tient compte ni de « Public » ni des brouillons ; ne pas l'utiliser pour Trois-Tiers.

# Publication automatique depuis troistiers.space (fonction `guild-quest-sync`, palier 2)

Le site publie la face publique d'un projet en quête de la guilde, puis la tient à jour.

- **Création** : clé du site (`X-Site-Key`) + jeton CTG d'un·e admin de la guilde. La quête est créée au nom de cette
  personne, dans la guilde, publique, et reliée au projet dans `quest_external_links` (un projet = une quête :
  une seconde publication renvoie la même quête). Seule une face publique peut être publiée.
- **Mises à jour** : clé du site seule, et seulement sur la quête que la fonction a reliée au projet, dans la guilde.
  Champs touchés : titre, description (résumé validé + besoins publics), nature, statut, adresse de la fiche,
  étiquettes, visibilité (une face qui n'est plus publique retire la quête des sites). Jamais budget, personnes,
  récompenses ni autre réglage.
- **Retrait** : clé du site seule ; si la face du projet n'est plus publique, la quête repasse en brouillon privé, sans
  qu'aucun contenu du projet soit envoyé. Une face redevenue publique la remet en ligne.

**Fermée par défaut.** Elle ne s'ouvre qu'avec trois secrets Supabase (à poser après la convention
Trois-Tiers × ChangeTheGame) :

| Secret | Valeur |
| --- | --- |
| `SITE_SYNC_KEY` | clé longue (32 caractères au moins), la même que `CTG_SITE_SYNC_KEY` dans le `.env` du site |
| `SITE_SYNC_GUILD_ID` | `4964c699-4684-43a9-b508-cee21c77e24e` |
| `SITE_SYNC_ORIGINS` | `https://troistiers.space` (et `http://localhost:4321` pour les essais) |

## Publication et accès propres (`guild-quest-sync`, `guild-member-profile`)

- `guild-quest-sync` accepte `"visibilite": {"mode": "public"}` ou `{"mode": "membres", "niveau_minimum": "N2" | "N3"}`.
  Chaque réponse porte `visibilite_appliquee_par_la_base`, **mesuré** dans la base à chaque appel (la politique
  restrictive sur les quêtes existe et est active). Tant qu'il est faux, `membres` est refusé (422
  `visibility_not_enforced`). `{"action": "status"}` lit cet état sans rien publier.
- `guild-member-profile` renvoie `acces_quetes` : `[{quest_id, niveau, accorde_par, accorde_le, expire_le}]` pour les
  quêtes reliées à un projet (`quest_external_links`, source `trois-tiers` par défaut, `?source=` sinon).
  `lecture` = accès personnel, `equipe` = participant, `admin` = co-admin de la quête (ADMIN, OWNER, HOST, CO_HOST) ;
  les admins hérités de la guilde n'y figurent pas. `accorde_par` est vide pour l'équipe (non enregistré).
  `null` si la base n'est pas encore à jour, `[]` si aucun accès.
- Test du contrat (quatre personnes lisent la même quête dans la base) : `supabase/tests/quest_access_levels.sql`,
  dans une transaction annulée :
  `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quest_access_levels.sql`.
