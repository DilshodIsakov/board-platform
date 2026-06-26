import { supabase } from "./supabaseClient";

/** Источник документа: материалы (documents) или регламенты (reg_documents). */
export type DocSource = "document" | "reg_document";

/** Привязка комментария к фрагменту документа. */
export type DocxAnchor = {
  type: "docx";
  startBlock: number;
  startOffset: number;
  endBlock: number;
  endOffset: number;
};

export type XlsxAnchor = {
  type: "xlsx";
  sheet: string;
  start: string; // A1-нотация, напр. "B4"
  end: string;   // для одиночной ячейки start === end
};

export type CommentAnchor = DocxAnchor | XlsxAnchor;

export interface DocumentComment {
  id: string;
  created_at: string;
  updated_at: string;
  document_id: string;
  source_type: DocSource;
  version_no: number;
  user_id: string;
  user_name: string;
  user_role: string;
  parent_comment_id: string | null;
  anchor: CommentAnchor | null;
  quoted_text: string | null;
  content: string;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolved_at: string | null;
  is_deleted: boolean;
}

/** Все комментарии документа (по всем версиям). Сортировка по времени. */
export async function fetchDocumentComments(
  documentId: string,
  source: DocSource = "document"
): Promise<DocumentComment[]> {
  const { data, error } = await supabase
    .from("document_comments")
    .select("*")
    .eq("document_id", documentId)
    .eq("source_type", source)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchDocumentComments error:", error);
    return [];
  }
  return data as DocumentComment[];
}

/** Добавить комментарий (корневой — с anchor, либо ответ — с parent_comment_id). */
export async function addDocumentComment(params: {
  document_id: string;
  source_type?: DocSource;
  version_no: number;
  user_id: string;
  user_name: string;
  user_role: string;
  content: string;
  anchor?: CommentAnchor | null;
  quoted_text?: string | null;
  parent_comment_id?: string | null;
}): Promise<DocumentComment | null> {
  const { data, error } = await supabase
    .from("document_comments")
    .insert({
      document_id: params.document_id,
      source_type: params.source_type ?? "document",
      version_no: params.version_no,
      user_id: params.user_id,
      user_name: params.user_name,
      user_role: params.user_role,
      content: params.content,
      anchor: params.anchor ?? null,
      quoted_text: params.quoted_text ?? null,
      parent_comment_id: params.parent_comment_id ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("addDocumentComment error:", error);
    throw new Error(error.message);
  }
  return data as DocumentComment;
}

/** Редактировать текст комментария (автор). */
export async function editDocumentComment(commentId: string, content: string): Promise<boolean> {
  const { error } = await supabase
    .from("document_comments")
    .update({ content })
    .eq("id", commentId);

  if (error) {
    console.error("editDocumentComment error:", error);
    return false;
  }
  return true;
}

/** Resolve / переоткрыть ветку (admin / corp_secretary). */
export async function setCommentStatus(
  commentId: string,
  status: "open" | "resolved",
  resolvedBy: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from("document_comments")
    .update({
      status,
      resolved_by: status === "resolved" ? resolvedBy : null,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", commentId);

  if (error) {
    console.error("setCommentStatus error:", error);
    return false;
  }
  return true;
}

/** Мягкое удаление комментария. */
export async function softDeleteDocumentComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("document_comments")
    .update({ is_deleted: true, content: "" })
    .eq("id", commentId);

  if (error) {
    console.error("softDeleteDocumentComment error:", error);
    return false;
  }
  return true;
}
