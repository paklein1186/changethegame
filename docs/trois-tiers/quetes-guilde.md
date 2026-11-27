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

## Nouvelles de quête depuis le site (palier 2, B3)

`guild-quest-sync` `{ "action": "news", "projet_id", "quest_id", "nouvelle": { "id", "titre", "texte" }, "auteur"? }`,
clé du site seule : publie une nouvelle (`quest_updates`, `posted_as_label` « Trois-Tiers ») sur une quête reliée au
projet. Une même nouvelle du site (`id`) n'est publiée qu'une fois (`quest_update_external_links`). Auteur : la personne
qui l'a validée sur le site si elle est membre de la guilde, sinon la personne qui a créé la quête. La nouvelle suit les
règles d'accès de la quête (contenu à l'équipe pour une quête réservée). Typiquement : un changement d'étape du projet,
dont le référent a validé le texte sur le site.

## Besoins et propositions d'aide depuis le site (palier 2, B4)

Toujours par `guild-quest-sync`, clé du site seule, sur une quête reliée au projet :

- `needs` : besoins de la quête (avec l'identifiant du site quand il y en a un) et nombre de propositions en attente.
- `needs_push` `{ besoins: [{ id, need_id?, titre, description, categorie, statut, supprime? }], auteur? }` : écrit les
  besoins retenus par le site. Un besoin né ici et repris par le site garde le même `quest_needs` (lien posé à ce moment).
  Un besoin retiré sur le site est fermé (`CLOSED`), jamais effacé. Lien : `quest_need_external_links`.
- `proposals` : propositions d'aide en attente, lues en direct pour le référent (nom et identifiant de profil, jamais
  d'e-mail ; le site ne les enregistre pas, il ne garde qu'un compteur).
- `proposal_decide` `{ proposal_id, decision: "accept" | "reject", auteur? }` : accepte ou refuse par la fonction de
  la base `decide_quest_proposal`, **la même que l'écran de la quête** : statut, crédits demandés versés (QUEST_REWARD),
  XP et notification d'un bloc. Les euros demandés ne sont pas versés par la plateforme : la personne est prévenue
  qu'ils se règlent directement avec l'équipe.

`decide_quest_proposal` corrige aussi l'écran de la quête, qui versait les crédits avec un type refusé par la base
(« EARNED_ACTION ») : la proposition passait acceptée sans versement. Peuvent décider : la personne qui a créé la
quête, un·e admin de la guilde hôte, un·e admin de la plateforme, ou le serveur (clé service_role).

Un besoin peut naître des deux côtés ; c'est le site qui fusionne (la dernière modification l'emporte).

## Discussion de la quête depuis le site (palier 2 : un seul fil de commentaires)

`quest-comments` (POST) : `{ action: "list" | "post", guild_id, quest_id, contenu?, parent_id? }`, avec le jeton de la
personne (facultatif pour lire, obligatoire pour écrire). Le fil est celui de la quête (`comments`, cible `QUEST`) :
le site le lit en direct et poste au nom de la personne ; il ne garde rien. Les règles d'accès de la base s'appliquent.

Migration `20261128170000_quest_comments_access.sql` : les commentaires d'une quête, de ses actualités et de ses
propositions demandent désormais l'accès complet à la quête, en lecture comme en écriture (ils étaient lisibles par
tout le monde, même pour une quête réservée).

## Quêtes nées sur ChangeTheGame : file « à classer » du site (palier 2, B5)

`guild-quest-sync` `{ "action": "guild_quests" }`, clé du site seule, lecture seule : toutes les quêtes de la guilde
(brouillons compris, champs d'administration) avec `projet_id`, le projet du site auquel chacune est reliée par la
publication automatique. Le site range les autres dans sa file « à classer » : la coordination les relie à un projet,
les accueille comme projet ou les écarte. Rien n'est adopté sans décision, et aucune quête n'est jamais recréée.

## Création automatique des projets transparents (décision de PA du 28/11, option C)

`guild-quest-sync` `{ "action": "create_auto", "projet_id", "face", "visibilite": { "mode": "public" }, "auteur"? }`,
clé du site seule : crée la quête d'un projet **transparent** dont le résumé est validé, sans clic de la coordination.
Refusé (422 `public_only`) pour toute face qui n'est pas publique : une quête réservée aux membres passe toujours par
`create`, avec le jeton d'un·e admin de la guilde. Auteur : `auteur` s'il administre la guilde, sinon la personne qui a
créé la guilde. Jamais de doublon (même lien `quest_external_links` que `create`).

## Salle d'attente des missions semi-sensibles (décisions de PA du 28/11)

Les missions semi-sensibles existantes sont considérées comme validées par la coordination (PA), avec retour en arrière
possible. Une NOUVELLE mission semi-sensible du site :
- arrive par `create_auto` avec `visibilite: { mode: "membres", … }` et `en_attente: true` : la quête est créée en
  **brouillon**, réservée aux membres selon son niveau, marquée `pending_validation` (`quest_external_links`) ; les admins
  de la guilde reçoivent une notification « Mission à valider » ;
- apparaît dans l'onglet **Travail** de la guilde, section « Missions en attente de validation » (admins seulement,
  `guild_pending_site_quests`), avec Valider (la quête est publiée) ou Garder privée (`decide_site_quest`) ;
- peut aussi être décidée sur troistiers.space : `update` avec `validee: true` (publiée, sortie de l'attente) ou
  `withdraw` avec `prive: true` (reste brouillon, sortie de l'attente). Le site relit la décision prise ici
  (`guild_quests` renvoie `en_attente` et `decision`).
Une quête en attente n'est jamais republiée par une mise à jour du site tant qu'elle n'est pas validée.
