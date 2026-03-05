import { supabase } from "./supabaseClient";

export interface Document {
  id: string;
  org_id: string;
  meeting_id: string | null;
  agenda_item_id: string | null;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
}

const BUCKET = "documents";

/** Очистить имя файла: заменить не-ASCII символы, пробелы и спецсимволы */
function sanitizeFileName(name: string): string {
  // Берём расширение отдельно
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  // Транслитерация кириллицы
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",
    ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",
    Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Sch",
    Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const transliterated = base.split("").map((c) => map[c] ?? c).join("");
  // Заменить пробелы и небезопасные символы
  const safe = transliterated.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return (safe || "file") + ext;
}

/** Загрузить все документы организации */
export async function fetchDocuments(): Promise<Document[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchDocuments error:", error);
    return [];
  }

  return data as Document[];
}

/** Загрузить документы по заседанию */
export async function fetchDocumentsByMeeting(meetingId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchDocumentsByMeeting error:", error);
    return [];
  }

  return data as Document[];
}

/** Загрузить файл в Storage и создать запись в documents */
export async function uploadDocument(
  file: File,
  orgId: string,
  uploadedBy: string,
  title: string,
  meetingId?: string,
  agendaItemId?: string
): Promise<Document | null> {
  // Уникальный путь: org_id/timestamp_safename
  const storagePath = `${orgId}/${Date.now()}_${sanitizeFileName(file.name)}`;

  // 1. Загрузка файла в Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file);

  if (uploadError) {
    console.error("upload error:", uploadError);
    throw new Error(uploadError.message);
  }

  // 2. Создание записи метаданных
  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      meeting_id: meetingId || null,
      agenda_item_id: agendaItemId || null,
      title,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();

  if (error) {
    console.error("insert document error:", error);
    throw new Error(error.message);
  }

  return data as Document;
}

/** Получить URL для скачивания файла (signed URL на 1 час) */
export async function getDownloadUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) {
    console.error("getDownloadUrl error:", error);
    return null;
  }

  return data.signedUrl;
}

/** Удалить документ (запись + файл) */
export async function deleteDocument(doc: Document): Promise<void> {
  // Удалить файл из Storage
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([doc.storage_path]);

  if (storageError) {
    console.error("delete storage error:", storageError);
  }

  // Удалить запись из БД
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", doc.id);

  if (error) {
    console.error("delete document error:", error);
    throw new Error(error.message);
  }
}

/** Форматировать размер файла */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}
