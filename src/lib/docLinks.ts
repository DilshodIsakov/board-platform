import { supabase } from "./supabaseClient";

export interface DocLink {
  id: string;
  org_id: string;
  title: string;
  title_en: string | null;
  title_uz: string | null;
  description: string | null;
  description_en: string | null;
  description_uz: string | null;
  url: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Fetch all active doc links for the current org */
export async function fetchDocLinks(): Promise<DocLink[]> {
  const { data, error } = await supabase
    .from("doc_links")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("title");

  if (error) {
    console.error("fetchDocLinks error:", error);
    return [];
  }

  return data as DocLink[];
}

/** Fetch all doc links (including inactive) for admin */
export async function fetchAllDocLinks(): Promise<DocLink[]> {
  const { data, error } = await supabase
    .from("doc_links")
    .select("*")
    .order("sort_order")
    .order("title");

  if (error) {
    console.error("fetchAllDocLinks error:", error);
    return [];
  }

  return data as DocLink[];
}

/** Create a new doc link */
export async function createDocLink(params: {
  org_id: string;
  title: string;
  title_en?: string | null;
  title_uz?: string | null;
  url: string;
  description?: string;
  description_en?: string | null;
  description_uz?: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_by?: string;
}): Promise<DocLink> {
  const { data, error } = await supabase
    .from("doc_links")
    .insert(params)
    .select()
    .single();

  if (error) {
    console.error("createDocLink error:", error);
    throw new Error(error.message);
  }

  return data as DocLink;
}

/** Update a doc link */
export async function updateDocLink(
  id: string,
  params: Partial<Pick<DocLink, "title" | "title_en" | "title_uz" | "url" | "description" | "description_en" | "description_uz" | "sort_order" | "is_active">>
): Promise<void> {
  const { error } = await supabase
    .from("doc_links")
    .update({ ...params, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateDocLink error:", error);
    throw new Error(error.message);
  }
}

/** Delete a doc link */
export async function deleteDocLink(id: string): Promise<void> {
  const { error } = await supabase
    .from("doc_links")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteDocLink error:", error);
    throw new Error(error.message);
  }
}
