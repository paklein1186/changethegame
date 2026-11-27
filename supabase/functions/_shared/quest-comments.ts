// Discussion d'une quête lue et écrite depuis un site partenaire (Trois-Tiers, palier 2 : un seul fil de
// commentaires, celui de la quête). Le site ne garde rien : il lit en direct et poste au nom de la personne, avec son
// propre jeton ; les règles d'accès de la base s'appliquent (quête réservée : membres seulement).
type Row = Record<string, any>;
export class CommentError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La quête existe, n'est pas supprimée et appartient à la guilde du site. */
export async function questOfGuild(admin: any, guildId: string, questId: string) {
  if (!UUID.test(guildId) || !UUID.test(questId)) throw new CommentError("invalid_id", "guild_id et quest_id attendus");
  const { data: q } = await admin.from("quests").select("id, guild_id, is_deleted").eq("id", questId).maybeSingle();
  if (!q || q.is_deleted || q.guild_id !== guildId) throw new CommentError("not_found", "quête introuvable dans cette guilde", 404);
  return q;
}

/** Commentaires de la quête que la personne (ou un visiteur) a le droit de lire, avec le nom de leurs auteurs. */
export async function listComments(viewer: any, admin: any, questId: string, userId: string | null) {
  const { data, error } = await viewer.from("comments").select("id, parent_id, content, author_id, created_at")
    .eq("target_type", "QUEST").eq("target_id", questId).eq("is_deleted", false).order("created_at", { ascending: true });
  if (error) throw new CommentError("db", error.message ?? "lecture impossible", 500);
  const rows: Row[] = (data ?? []).slice(-300);
  const ids = [...new Set(rows.map((c) => c.author_id))];
  const { data: profils } = ids.length ? await admin.from("profiles").select("user_id, name, avatar_url").in("user_id", ids) : { data: [] };
  const p = new Map((profils ?? []).map((x: Row) => [x.user_id, x]));
  let peutEcrire = false;
  if (userId) {
    const { data: ok } = await viewer.rpc("can_access_quest", { _quest_id: questId });
    peutEcrire = ok === true;
  }
  return {
    quest_id: questId, peut_ecrire: peutEcrire,
    commentaires: rows.map((c) => ({
      id: c.id, parent_id: c.parent_id ?? null, contenu: c.content, cree_le: c.created_at,
      auteur: { id: c.author_id, nom: (p.get(c.author_id) as Row | undefined)?.name ?? null, avatar: (p.get(c.author_id) as Row | undefined)?.avatar_url ?? null },
      de_moi: userId !== null && c.author_id === userId,
    })),
  };
}

/** Poster au nom de la personne (son jeton) : la base vérifie qu'elle a accès à la quête. */
export async function postComment(viewer: any, questId: string, userId: string, contenu: unknown, parentId?: unknown) {
  const texte = typeof contenu === "string" ? contenu.trim() : "";
  if (!texte || texte.length > 4000) throw new CommentError("invalid_content", "commentaire vide ou trop long (4000 caractères)");
  let parent: string | null = null;
  if (parentId !== undefined && parentId !== null && parentId !== "") {
    if (typeof parentId !== "string" || !UUID.test(parentId)) throw new CommentError("invalid_parent", "parent_id invalide");
    const { data: pc } = await viewer.from("comments").select("id, target_type, target_id").eq("id", parentId).maybeSingle();
    if (!pc || pc.target_type !== "QUEST" || pc.target_id !== questId) throw new CommentError("invalid_parent", "réponse à un commentaire d'une autre discussion");
    parent = parentId;
  }
  const { data, error } = await viewer.from("comments").insert({
    content: texte, author_id: userId, target_type: "QUEST", target_id: questId, parent_id: parent,
  }).select("id, created_at").single();
  if (error || !data) {
    if (error?.code === "42501") throw new CommentError("forbidden", "pas d'accès à la discussion de cette quête", 403);
    throw new CommentError("db", error?.message ?? "écriture impossible", 500);
  }
  return { quest_id: questId, id: data.id, cree_le: data.created_at };
}
