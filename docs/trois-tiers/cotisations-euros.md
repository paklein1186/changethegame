# Cotisations de guilde en euros (Stripe) — mise en place

Première guilde concernée : Trois-Tiers, avec son propre compte Stripe.
Les cotisations arrivent sur le compte de la guilde, pas sur celui de Poiethic, et ne passent pas par les Coins.

## Ce que contient cette branche

| Élément | Rôle |
| --- | --- |
| `supabase/migrations/20261119150000_guild_euro_membership.sql` | Correctif de sécurité des adhésions ; formules en euros par guilde ; badges datés et à portée ; journal des événements Stripe |
| `supabase/functions/guild-euro-checkout` | Crée la session de paiement Stripe (abonnement annuel ou mensuel) ; recalcule toujours le montant côté serveur |
| `supabase/functions/guild-euro-confirm` | Au retour de Stripe, relit la session chez Stripe et active l'adhésion sans attendre le webhook |
| `supabase/functions/guild-euro-webhook` | Active l'adhésion et les badges au paiement, prolonge au renouvellement, gère échec et résiliation |
| `supabase/functions/_shared/guild-euro-membership.ts` | Activation commune (idempotente) aux deux fonctions précédentes |
| `src/components/guild/GuildEuroMembershipCard.tsx` | Carte « Cotisation » de la page de guilde, à la place de la carte Coins quand les euros sont activés |
| `docs/trois-tiers/cotisations.sql` | Formules de Trois-Tiers à charger une fois |

## Correctif de sécurité (à déployer même sans les euros)

Avant : un membre connecté pouvait modifier toute sa ligne d'adhésion (statut, date d'échéance) et s'inscrire directement comme membre.
Après : il ne peut que rejoindre comme invité (`guest`) et arrêter son renouvellement. Tout le reste passe par les fonctions serveur.
L'appli actuelle (`useGuildMembership`) continue de fonctionner : elle n'utilise que ces deux gestes.

## Tester dans un brouillon Lovable

Le brouillon a sa propre base de test, mais son backend demande une connexion Lovable : Stripe ne peut pas y livrer de webhook.
Le paiement initial est quand même activé, par guild-euro-confirm, au retour de Stripe.

1. Dans le brouillon : secret `STRIPE_SECRET_KEY_GUILD` avec une clé **sk_test_…** (jamais une clé live).
2. « Mettre à jour » le brouillon depuis main une fois cette branche fusionnée, ou y appliquer la branche.
3. Exécuter `docs/trois-tiers/cotisations.sql` avec l'identifiant de la guilde Trois-Tiers du brouillon.
4. Se connecter avec le compte visiteur, candidater, faire accepter la candidature par le compte administrateur,
   puis payer avec la carte `4242 4242 4242 4242`. Au retour, la carte doit afficher « Adhésion active jusqu'au … ».
5. Le renouvellement, l'échec de paiement et la résiliation passent par le webhook : à tester sur un backend joignable.

## Mise en place, dans l'ordre (en mode test d'abord)

1. **Secrets Supabase** (console Lovable Cloud ou Supabase → Edge Functions → Secrets) :
   - `STRIPE_SECRET_KEY_GUILD` : clé secrète du compte Stripe de Trois-Tiers (déjà ajoutée) ;
   - `STRIPE_WEBHOOK_SECRET_GUILD` : secret du webhook, obtenu à l'étape 3 ;
   - `GUILD_CHECKOUT_RETURN_ORIGINS` : origines autorisées pour le retour après paiement, séparées par des virgules,
     ex. `https://troistiers.space,http://localhost:4321` ; les aperçus `*.lovableproject.com` et `*.lovable.app`
     sont acceptés par défaut (`GUILD_CHECKOUT_RETURN_SUFFIXES` pour changer cette liste).
2. **Déployer** la migration et les deux fonctions.
3. **Webhook Stripe** (tableau de bord Stripe de Trois-Tiers → Développeurs → Webhooks) :
   - adresse : `https://anzeimppqytonfxrnqxp.supabase.co/functions/v1/guild-euro-webhook?account=GUILD`
   - événements : `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
   - copier le secret de signature dans `STRIPE_WEBHOOK_SECRET_GUILD`.
4. **Formules** : exécuter `docs/trois-tiers/cotisations.sql` en remplaçant `<GUILD_ID>`.
5. **Tester** avec la carte de test Stripe `4242 4242 4242 4242` : l'adhésion doit passer à `active`,
   avec `current_period_end` dans un an, et le badge « Adhérent » doit apparaître avec la même date d'expiration.

## Appel depuis un client (ChangeTheGame ou troistiers.space)

```ts
const { data } = await supabase.functions.invoke("guild-euro-checkout", {
  body: {
    guild_id: "<GUILD_ID>",
    plan_code: "partenaire_beneficiaire",
    small_places: 3,           // lieux portés de moins de 20 usagers
    large_places: 2,           // lieux portés de 20 usagers ou plus
    return_url: "https://troistiers.space/membre",
  },
});
window.location.href = data.url; // page de paiement Stripe
```

Exemple : 350 € + 3 × 60 € + 2 × 100 € = 730 € par an.

## Codes d'adhésion : payer pour d'autres (décision du 19/11/2026)

Un payeur (organisation d'accompagnement, GAL partenaire bénéficiaire) paie des places en plus de sa propre adhésion.
À l'activation du paiement, **un code par place** est créé (`guild_membership_codes`, format `XXXX-XXXX-XXXX`).
Le payeur distribue ses codes ; chaque bénéficiaire saisit le sien avec son propre compte et devient adhérent.

| Élément | Rôle |
| --- | --- |
| `supabase/migrations/20261120100000_guild_membership_codes.sql` | Table des codes ; formule donnée à chaque type de place (`small_place_plan_code`, `large_place_plan_code`, `extra_person_plan_code`) |
| `supabase/functions/guild-membership-redeem` | `POST { code }` : utilise un code pour la personne connectée |
| `supabase/functions/guild-membership-codes` | `GET ?guild_id=` : codes achetés par la personne connectée (utilisé ou non, sans dire par qui) |

- Formule du bénéficiaire : lieux portés → `lieu_moins_20` / `lieu_20_et_plus` ; personne supplémentaire → formule du payeur.
- Les bénéficiaires partagent l'abonnement Stripe du payeur : renouvellement → prolongés ; impayé ou résiliation → même statut.
- Un code ne sert qu'une fois ; refusé s'il est expiré, s'il est utilisé par le payeur lui-même, ou si la personne a déjà
  sa propre cotisation en cours. Le payeur reçoit une notification quand un code est utilisé.
- Pas encore géré : changer le nombre de places en cours d'année, retirer un code déjà utilisé.

## Limites connues

- Un seul badge par rôle et par personne (contrainte existante) : le badge « actif » à portée multiple viendra ensuite.
- Les fonctions n'ont pas pu être vérifiées par `deno check` depuis l'environnement de développement (esm.sh inaccessible) ;
  la migration a été validée par un analyseur SQL, pas sur une base réelle.
