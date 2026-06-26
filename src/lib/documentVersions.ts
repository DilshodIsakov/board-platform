import { supabase } from "./supabaseClient";
import type { DocSource } from "./documentComments";

const BUCKET = "documents";

/** Общая форма документа для режима рецензирования (documents и reg_documents). */
export interface ReviewableDoc {
  id: string;
  org_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
  title?: string | null;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  source_type: DocSource;
  version_no: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  change_note: string | null;
  created_at: string;
}

/** Унифицированное представление версии (включая оригинал = версия 1). */
export interface VersionInfo {
  version_no: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  change_note: string | null;
  created_at: string;
  is_original: boolean;
}

/** Транслитерация + очистка имени файла для Storage. */
function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",
    ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",
    Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Sch",
    Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const transliterated = base.split("").map((c) => map[c] ?? c).join("");
  const safe = transliterated.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return (safe || "file") + ext;
}

/** Загрузить дополнительные версии (2, 3, ...) для документа. */
export async function fetchVersions(
  documentId: string,
  source: DocSource = "document"
): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .eq("source_type", source)
    .order("version_no", { ascending: true });

  if (error) {
    console.error("fetchVersions error:", error);
    return [];
  }
  return data as DocumentVersion[];
}

/**
 * Полный список версий документа: оригинал (версия 1, из исходной записи)
 * + последующие версии из document_versions. Отсортирован по version_no.
 */
export async function listAllVersions(doc: ReviewableDoc, source: DocSource = "document"): Promise<VersionInfo[]> {
  const extra = await fetchVersions(doc.id, source);
  const original: VersionInfo = {
    version_no: 1,
    storage_path: doc.storage_path,
    file_name: doc.file_name,
    file_size: doc.file_size,
    mime_type: doc.mime_type,
    uploaded_by: doc.uploaded_by,
    change_note: null,
    created_at: doc.created_at,
    is_original: true,
  };
  const rest: VersionInfo[] = extra.map((v) => ({
    version_no: v.version_no,
    storage_path: v.storage_path,
    file_name: v.file_name,
    file_size: v.file_size,
    mime_type: v.mime_type,
    uploaded_by: v.uploaded_by,
    change_note: v.change_note,
    created_at: v.created_at,
    is_original: false,
  }));
  return [original, ...rest];
}

/** Номер последней (актуальной) версии документа. */
export async function latestVersionNo(documentId: string, source: DocSource = "document"): Promise<number> {
  const versions = await fetchVersions(documentId, source);
  if (versions.length === 0) return 1;
  return Math.max(...versions.map((v) => v.version_no));
}

/** Signed URL (1 час) для скачивания/просмотра файла версии. */
export async function getVersionUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) {
    console.error("getVersionUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

/** Скачать файл версии как ArrayBuffer (для рендера в браузере). */
export async function downloadVersionBytes(storagePath: string): Promise<ArrayBuffer | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    console.error("downloadVersionBytes error:", error);
    return null;
  }
  return await data.arrayBuffer();
}

/**
 * Загрузить новую (финальную) версию документа.
 * Доступно только admin / corp_secretary (RLS). Оригинал не меняется.
 */
export async function uploadNewVersion(
  doc: ReviewableDoc,
  source: DocSource,
  file: File,
  uploadedBy: string,
  changeNote?: string
): Promise<DocumentVersion | null> {
  const nextNo = (await latestVersionNo(doc.id, source)) + 1;
  const storagePath = `${doc.org_id}/${doc.id}/v${nextNo}_${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
  if (uploadError) {
    console.error("uploadNewVersion storage error:", uploadError);
    throw new Error(uploadError.message);
  }

  const { data, error } = await supabase
    .from("document_versions")
    .insert({
      document_id: doc.id,
      source_type: source,
      version_no: nextNo,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      uploaded_by: uploadedBy,
      change_note: changeNote || null,
    })
    .select()
    .single();

  if (error) {
    console.error("uploadNewVersion insert error:", error);
    // подчистим загруженный файл, чтобы не висел сиротой
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }
  return data as DocumentVersion;
}
