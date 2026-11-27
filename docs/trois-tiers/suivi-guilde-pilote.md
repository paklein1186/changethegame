# Faire suivre la guilde Trois-Tiers par l'agent du Pilote (boucler la boucle)

Le circuit existant : le Pilote 3/3 (artefact claude.ai du compte Trois-Tiers) → export JSON déposé dans Drive par
l'agent planifié du Mac mini → base Trois-Tiers et site → missions publiées en quêtes sur ChangeTheGame.
Ce qui manquait : le retour. Les discussions, décisions, contributions et besoins qui naissent **sur ChangeTheGame**
reviennent dans le Pilote **sous forme de propositions**, validées par un humain comme les autres ; l'export suivant
les emporte vers le site.

Un seul outil côté ChangeTheGame : `get_guild_activity`, sur le connecteur OAuth `mcp` (au nom d'une personne) ou sur
le serveur à clé de guilde `guild-mcp` ; le calcul est le même (fonction de base `guild_activity`). En un appel, tout ce
qui s'est passé depuis une date : messages des salons, de la discussion de la guilde et des discussions de ses quêtes,
et leurs réponses ; décisions (ouvertes, modifiées, closes, avec le décompte des votes et l'issue) ; quêtes créées ou
modifiées ; actualités de quête ; besoins ; contributions proposées ; événements ; nouveaux membres. Jamais les
messages privés. Chaque élément porte son lien ChangeTheGame et, si la quête est reliée à un projet du site,
`linked_project.projet_id`. La réponse donne `next_since`, à repasser au prochain appel.

## 1. Le connecteur (compte claude.ai Trois-Tiers, Mac mini, une fois) — connexion OAuth, recommandée

Réglages → Connecteurs → **Ajouter un connecteur personnalisé** : nom « ChangeTheGame », adresse
`https://anzeimppqytonfxrnqxp.supabase.co/functions/v1/mcp`. Claude ouvre la page de connexion de ChangeTheGame :
se connecter avec le compte ChangeTheGame **de la coordination** (admin de la guilde Trois-Tiers), puis accepter.

Pourquoi OAuth plutôt qu'une clé :
- aucun secret dans une adresse ; des jetons courts, renouvelés tout seuls ;
- l'agent lit **avec les droits de ce compte** : mêmes règles que sur le site (salons, quêtes réservées) ;
- l'accès se retire en déconnectant le connecteur ou le compte, et l'on sait qui lit.

L'agent lit ce que ce compte peut voir : un admin de la guilde voit tout (quêtes réservées comprises), un simple
membre seulement son niveau. L'outil exige d'être membre de la guilde.

## 2. (Autre possibilité) Une clé de guilde en lecture seule

Si l'on ne veut pas lier l'agent à une personne : guilde Trois-Tiers → Paramètres → **MCP Agents** → cocher **Read
only** → **Generate**, puis ajouter un connecteur avec l'**adresse du connecteur** affichée (`…/functions/v1/guild-mcp?key=ctg_…`).
La clé voit toute la guilde et ne peut rien y écrire ; elle se révoque au même endroit. L'outil s'appelle aussi
`get_guild_activity` (sans `guild_id` : la clé désigne la guilde).

## 3. La tâche planifiée (compte Trois-Tiers)

Une tâche distincte de l'export, qui tourne **avant** lui (par exemple du lundi au vendredi à 9 h 40 et 15 h 40,
Bruxelles), pour que l'export de 9 h 52 / 15 h 52 emporte les propositions. Coller dans une conversation du compte
Trois-Tiers, avec le connecteur ChangeTheGame et l'outil de données des artefacts :

> Crée une tâche planifiée « Suivi ChangeTheGame → Pilote 3/3 », du lundi au vendredi à 9 h 40 et 15 h 40 (Bruxelles).
> À chaque passage :
>
> 1. Dans le Pilote 3/3 (https://claude.ai/artifact/WchYGZ2spfyvMZPbPMx8XW), retrouve la dernière entrée de journal
>    « Suivi CTG » et sa valeur `next_since`. S'il n'y en a pas, prends il y a 48 heures.
> 2. Appelle `get_guild_activity` du connecteur « ChangeTheGame » pour la guilde Trois-Tiers (son identifiant :
>    `4964c699-4684-43a9-b508-cee21c77e24e`, ou via `list_my_guilds`) avec `since` = cette date. Si la réponse
>    dit `truncated: true`, rappelle-le avec `since` = la date du dernier élément lu, jusqu'à tout avoir.
> 3. Retiens seulement ce qui compte pour le Pilote : une décision prise ou close (et son issue), un engagement, une
>    échéance ou une répartition du travail dans une discussion, une nouvelle contribution ou un nouveau besoin sur une
>    quête, un événement, un nouveau membre de l'équipe d'une mission. Ignore les remerciements, salutations et
>    messages sans décision ni action.
> 4. Pour chaque point retenu, crée **une proposition** dans le Pilote, exactement comme le font déjà les agents de
>    l'onglet « Agents & journal » (même format) : provenance `ctg`, un résumé d'une ou deux phrases dans tes mots
>    (jamais le message recopié en entier), le lien ChangeTheGame comme source, et la mission concernée — celle dont
>    le projet correspond à `linked_project.projet_id`, sinon celle dont le titre correspond à la quête, sinon aucune.
>    Une décision close ou un engagement deviennent une proposition de mise à jour de la tâche ou de la mission
>    concernée. **Ne modifie jamais directement une tâche, une mission ou une absence** : un humain valide.
>    Ne crée pas deux fois la même proposition : si une proposition en attente porte déjà le même lien, complète-la.
> 5. Ajoute au journal du Pilote une entrée « Suivi CTG » avec `next_since` (tel que renvoyé), le nombre d'éléments lus
>    et le nombre de propositions créées.
> 6. Si un appel échoue, ne crée rien, n'écris pas de `next_since` et signale l'erreur dans le compte rendu du passage.
>
> Fais un premier passage tout de suite sur les 7 derniers jours (`since` = il y a 7 jours) et montre-moi les
> propositions créées.

## Pourquoi c'est simple

- Rien de nouveau à héberger : le serveur MCP de la guilde existe déjà, le Pilote sait déjà recevoir des propositions
  d'agents, l'export les emporte déjà vers le site (`proposals`, provenance `ctg` prévue par le contrat v1).
- Un seul outil à appeler, une seule date à retenir (`next_since`, gardée dans le journal du Pilote).
- Rien n'est écrit sur ChangeTheGame (clé en lecture seule), rien n'est appliqué au Pilote sans validation humaine.

## Limites

- Avec un compte de coordination (ou la clé de guilde), l'agent voit toute la guilde, quêtes réservées comprises : le
  Pilote ne doit être ouvert qu'à l'équipe, comme aujourd'hui.
- Plafond de 100 éléments par section et par appel (200 au plus), d'où la reprise quand `truncated` vaut vrai ;
  fenêtre de 31 jours au plus par appel.
