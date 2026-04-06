import { supabase } from "./supabaseClient";

export type RegKind = "internal" | "external" | "reports";

export interface RegCategory {
  id: string;
  org_id: string;
  kind: RegKind;
  name: string;
  name_en: string | null;
  name_uz: string | null;
  order_index: number;
  created_at: string;
}

export interface RegDocument {
  id: string;
  org_id: string;
  category_id: string;
  title: string;
  title_en: string | null;
  title_uz: string | null;
  description: string | null;
  description_en: string | null;
  description_uz: string | null;
  effective_date: string | null;
  version: string;
  issuing_body: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string | null;
  is_archived: boolean;
  created_at: string;
}

const BUCKET = "documents";

// ── Categories ────────────────────────────────────────────────

export async function fetchRegCategories(): Promise<RegCategory[]> {
  const { data, error } = await supabase
    .from("reg_categories")
    .select("*")
    .order("order_index", { ascending: true });
  if (error) { console.error("fetchRegCategories:", error); return []; }
  return data as RegCategory[];
}

export async function createRegCategory(params: {
  org_id: string;
  kind: RegKind;
  name: string;
  name_en?: string;
  name_uz?: string;
  order_index?: number;
}): Promise<RegCategory | null> {
  const { data, error } = await supabase
    .from("reg_categories")
    .insert(params)
    .select()
    .single();
  if (error) { console.error("createRegCategory:", error); return null; }
  return data as RegCategory;
}

export async function deleteRegCategory(id: string): Promise<boolean> {
  const { error } = await supabase.from("reg_categories").delete().eq("id", id);
  if (error) { console.error("deleteRegCategory:", error); return false; }
  return true;
}

// ── Documents ─────────────────────────────────────────────────

export async function fetchRegDocuments(
  categoryId: string,
  includeArchived = false
): Promise<RegDocument[]> {
  let q = supabase
    .from("reg_documents")
    .select("*")
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false });
  if (!includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q;
  if (error) { console.error("fetchRegDocuments:", error); return []; }
  return data as RegDocument[];
}

export async function uploadRegDocument(
  file: File,
  orgId: string,
  categoryId: string,
  uploadedBy: string,
  meta: {
    title: string;
    title_en?: string;
    title_uz?: string;
    description?: string;
    description_en?: string;
    description_uz?: string;
    effective_date?: string;
    version?: string;
    issuing_body?: string;
  }
): Promise<RegDocument> {
  const safeName = file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, "_");
  const storagePath = `${orgId}/regulations/${categoryId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("reg_documents")
    .insert({
      org_id: orgId,
      category_id: categoryId,
      uploaded_by: uploadedBy,
      title: meta.title,
      title_en: meta.title_en || null,
      title_uz: meta.title_uz || null,
      description: meta.description || null,
      description_en: meta.description_en || null,
      description_uz: meta.description_uz || null,
      effective_date: meta.effective_date || null,
      version: meta.version || "1.0",
      issuing_body: meta.issuing_body || null,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RegDocument;
}

export async function getRegDocumentUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

export async function archiveRegDocument(id: string, archive: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("reg_documents")
    .update({ is_archived: archive })
    .eq("id", id);
  if (error) { console.error("archiveRegDocument:", error); return false; }
  return true;
}

export async function deleteRegDocument(doc: RegDocument): Promise<boolean> {
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await supabase.from("reg_documents").delete().eq("id", doc.id);
  if (error) { console.error("deleteRegDocument:", error); return false; }
  return true;
}
