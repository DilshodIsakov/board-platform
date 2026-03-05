import { supabase } from "./supabaseClient";

// ============================================================
// Интерфейсы
// ============================================================

export interface BoardTask {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done" | "canceled" | "overdue";
  due_date: string | null;
  created_at: string;
  updated_at: string;
  related_meeting_id: string | null;
  related_agenda_item_id: string | null;
  // joined
  assignees?: BoardTaskAssignee[];
  creator?: { full_name: string };
}

export interface BoardTaskAssignee {
  id: string;
  task_id: string;
  assignee_profile_id: string;
  role_in_task: "executor" | "co_executor" | "controller";
  // joined profile
  profile?: { id: string; full_name: string; role: string };
}

export interface BoardTaskComment {
  id: string;
  task_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  author?: { full_name: string };
}

export interface BoardTaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  uploader?: { full_name: string };
}

// ============================================================
// Фильтры
// ============================================================

export interface TaskFilters {
  status?: string;
  priority?: string;
  duePeriod?: "all" | "overdue" | "week";
  search?: string;
}

// ============================================================
// CRUD
// ============================================================

const BUCKET = "board-task-files";

/** Список поручений с фильтрами */
export async function listTasks(
  orgId: string,
  filters?: TaskFilters
): Promise<BoardTask[]> {
  let q = supabase
    .from("board_tasks")
    .select(
      `*,
       assignees:board_task_assignees(id, task_id, assignee_profile_id, role_in_task, profile:profiles!board_task_assignees_assignee_profile_id_fkey(id, full_name, role)),
       creator:profiles!board_tasks_created_by_fkey(full_name)`
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  if (filters?.priority && filters.priority !== "all") {
    q = q.eq("priority", filters.priority);
  }
  if (filters?.duePeriod === "overdue") {
    q = q.lt("due_date", new Date().toISOString().slice(0, 10));
    q = q.neq("status", "done").neq("status", "canceled");
  } else if (filters?.duePeriod === "week") {
    const today = new Date();
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    q = q.gte("due_date", today.toISOString().slice(0, 10));
    q = q.lte("due_date", weekLater.toISOString().slice(0, 10));
  }
  if (filters?.search) {
    q = q.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("listTasks error:", error);
    return [];
  }
  return data as BoardTask[];
}

/** Получить одно поручение со всеми связями */
export async function getTask(taskId: string): Promise<BoardTask | null> {
  const { data, error } = await supabase
    .from("board_tasks")
    .select(
      `*,
       assignees:board_task_assignees(id, task_id, assignee_profile_id, role_in_task, profile:profiles!board_task_assignees_assignee_profile_id_fkey(id, full_name, role)),
       creator:profiles!board_tasks_created_by_fkey(full_name)`
    )
    .eq("id", taskId)
    .single();

  if (error) {
    console.error("getTask error:", error);
    return null;
  }
  return data as BoardTask;
}

/** Создать поручение */
export async function createTask(payload: {
  organization_id: string;
  created_by: string;
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  related_meeting_id?: string;
  related_agenda_item_id?: string;
}): Promise<BoardTask> {
  const { data, error } = await supabase
    .from("board_tasks")
    .insert({
      organization_id: payload.organization_id,
      created_by: payload.created_by,
      title: payload.title,
      description: payload.description || null,
      priority: payload.priority || "medium",
      due_date: payload.due_date || null,
      related_meeting_id: payload.related_meeting_id || null,
      related_agenda_item_id: payload.related_agenda_item_id || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as BoardTask;
}

/** Обновить поручение */
export async function updateTask(
  id: string,
  patch: Partial<Pick<BoardTask, "title" | "description" | "priority" | "status" | "due_date">>
): Promise<void> {
  const { error } = await supabase
    .from("board_tasks")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/** Удалить поручение */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("board_tasks")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/** RPC: сменить статус (для исполнителей) */
export async function setTaskStatus(taskId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc("set_task_status", {
    p_task_id: taskId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

// ============================================================
// Назначения
// ============================================================

export async function addAssignee(
  taskId: string,
  profileId: string,
  roleInTask: string = "executor"
): Promise<void> {
  const { error } = await supabase
    .from("board_task_assignees")
    .insert({ task_id: taskId, assignee_profile_id: profileId, role_in_task: roleInTask });

  if (error) throw new Error(error.message);
}

export async function removeAssignee(taskId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("board_task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("assignee_profile_id", profileId);

  if (error) throw new Error(error.message);
}

// ============================================================
// Комментарии
// ============================================================

export async function listComments(taskId: string): Promise<BoardTaskComment[]> {
  const { data, error } = await supabase
    .from("board_task_comments")
    .select("*, author:profiles!board_task_comments_author_profile_id_fkey(full_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listComments error:", error);
    return [];
  }
  return data as BoardTaskComment[];
}

export async function addComment(
  taskId: string,
  authorId: string,
  body: string
): Promise<BoardTaskComment> {
  const { data, error } = await supabase
    .from("board_task_comments")
    .insert({ task_id: taskId, author_profile_id: authorId, body })
    .select("*, author:profiles!board_task_comments_author_profile_id_fkey(full_name)")
    .single();

  if (error) throw new Error(error.message);
  return data as BoardTaskComment;
}

// ============================================================
// Вложения
// ============================================================

export async function listAttachments(taskId: string): Promise<BoardTaskAttachment[]> {
  const { data, error } = await supabase
    .from("board_task_attachments")
    .select("*, uploader:profiles!board_task_attachments_uploaded_by_fkey(full_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listAttachments error:", error);
    return [];
  }
  return data as BoardTaskAttachment[];
}

export async function uploadAttachment(
  taskId: string,
  file: File,
  profileId: string,
  orgId: string
): Promise<BoardTaskAttachment> {
  const fileId = crypto.randomUUID();
  const storagePath = `org/${orgId}/tasks/${taskId}/${fileId}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file);

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("board_task_attachments")
    .insert({
      task_id: taskId,
      uploaded_by: profileId,
      file_name: file.name,
      file_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as BoardTaskAttachment;
}

export async function getAttachmentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.error("getAttachmentUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

export async function deleteAttachment(att: BoardTaskAttachment): Promise<void> {
  await supabase.storage.from(BUCKET).remove([att.file_path]);

  const { error } = await supabase
    .from("board_task_attachments")
    .delete()
    .eq("id", att.id);

  if (error) throw new Error(error.message);
}

// ============================================================
// Утилиты
// ============================================================

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

/** Загрузить всех профилей организации (для выбора исполнителей) */
export async function listOrgProfiles(orgId: string): Promise<{ id: string; full_name: string; role: string }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("organization_id", orgId)
    .order("full_name");

  if (error) {
    console.error("listOrgProfiles error:", error);
    return [];
  }
  return data;
}
