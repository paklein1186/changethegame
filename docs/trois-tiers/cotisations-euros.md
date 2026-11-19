# Cotisations de guilde en euros (Stripe) — mise en place

Première guilde concernée : Trois-Tiers, avec son propre compte Stripe.
Les cotisations arrivent sur le compte de la guilde, pas sur celui de Poiethic, et ne passent pas par les Coins.

## Ce que contient cette branche

| Élément | Rôle |
| --- | --- |
| `supabase/migrations/20261119150000_guild_euro_membership.sql` | Correctif de sécurité des adhésions ; formules en euros par guilde ; badges datés et à portée ; journal des événements Stripe |
| `supabase/functions/guild-euro-checkout` | Crée la session de paiement Stripe (abonnement annuel ou mensuel) ; recalcule toujours le montant côté serveur |
| `supabase/functions/guild-euro-webhook` | Active l'adhésion et les badges au paiement, prolonge au renouvellement, gère échec et résiliation |
| `docs/trois-tiers/cotisations.sql` | Formules de Trois-Tiers à charger une fois |

## Correctif de sécurité (à déployer même sans les euros)

Avant : un membre connecté pouvait modifier toute sa ligne d'adhésion (statut, date d'échéance) et s'inscrire directement comme membre.
Après : il ne peut que rejoindre comme invité (`guest`) et arrêter son renouvellement. Tout le reste passe par les fonctions serveur.
L'appli actuelle (`useGuildMembership`) continue de fonctionner : elle n'utilise que ces deux gestes.

## Mise en place, dans l'ordre (en mode test d'abord)

1. **Secrets Supabase** (console Lovable Cloud ou Supabase → Edge Functions → Secrets) :
   - `STRIPE_SECRET_KEY_GUILD` : clé secrète du compte Stripe de Trois-Tiers (déjà ajoutée) ;
   - `STRIPE_WEBHOOK_SECRET_GUILD` : secret du webhook, obtenu à l'étape 3 ;
   - `GUILD_CHECKOUT_RETURN_ORIGINS` : origines autorisées pour le retour après paiement, séparées par des virgules,
     ex. `https://troistiers.space,http://localhost:4321`.
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

## Limites connues

- Le payeur est encore la personne connectée : le paiement d'un GAL pour ses lieux, ou d'une organisation pour plusieurs
  personnes, compte les quantités mais n'attribue pas encore l'adhésion à chacun.
- Un seul badge par rôle et par personne (contrainte existante) : le badge « actif » à portée multiple viendra ensuite.
- Les fonctions n'ont pas pu être vérifiées par `deno check` depuis l'environnement de développement (esm.sh inaccessible) ;
  la migration a été validée par un analyseur SQL, pas sur une base réelle.
