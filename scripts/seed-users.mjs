/**
 * Создание тестовых пользователей через Supabase Admin API
 * Запуск: node scripts/seed-users.mjs
 */

const SUPABASE_URL = "https://lfpvjnzqdfdnefpvicut.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcHZqbnpxZGZkbmVmcHZpY3V0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTgzNzg2MCwiZXhwIjoyMDg3NDEzODYwfQ.i893I3JLFDJ3u9bzMTMxRSNOibGCeOpGH6nK58Un7Ww";

const PASSWORD = "Test1234!";

// Все пользователи: [email, full_name, role, shares_count]
const USERS = [
  // НС — 7 членов (karimov уже создан через Dashboard)
  ["sultanova@res.test",     "Султанова Малика Азизовна",       "board_member", 800000],
  ["rakhmatullaev@res.test", "Рахматуллаев Фарход Ильхомович",  "board_member", 900000],
  ["yuldasheva@res.test",    "Юлдашева Нилуфар Шавкатовна",     "board_member", 700000],
  ["mirzaev@res.test",       "Мирзаев Азиз Бахтиёрович",        "board_member", 650000],
  ["khasanova@res.test",     "Хасанова Дилноза Уктамовна",      "board_member", 550000],
  ["abdullaev@res.test",     "Абдуллаев Тимур Равшанович",       "board_member", 600000],
  // Правление — 6 членов
  ["normatov@res.test",      "Норматов Шерзод Алишерович",      "executive",    500000],
  ["inoyatov@res.test",      "Иноятов Рустам Камолович",        "executive",    350000],
  ["tashmatov@res.test",     "Ташматов Бобур Нодирович",        "executive",    350000],
  ["safarov@res.test",       "Сафаров Жасур Бахромович",        "executive",    200000],
  ["kadirov@res.test",       "Кадиров Отабек Исломович",        "executive",    150000],
  ["tursunov@res.test",      "Турсунов Дильшод Фаррухович",     "executive",    150000],
  // Исполнительный орган — 10
  ["nazarova@res.test",      "Назарова Гулчехра Хамидовна",     "department_head", 0],
  ["akbarov@res.test",       "Акбаров Шухрат Тохирович",        "department_head", 0],
  ["usmanova@res.test",      "Усманова Феруза Рахимовна",       "department_head", 0],
  ["rasulov@res.test",       "Расулов Нодир Бахтиёрович",       "department_head", 0],
  ["kholmatova@res.test",    "Холматова Зулфия Абдуллаевна",    "department_head", 0],
  ["mamatov@res.test",       "Маматов Улугбек Набиевич",        "department_head", 0],
  ["ergashev@res.test",      "Эргашев Бахром Тулкинович",       "department_head", 0],
  ["zhuraev@res.test",       "Жураев Сардор Камолович",         "department_head", 0],
  ["nurmatov@res.test",      "Нурматов Ботир Рашидович",        "department_head", 0],
  ["azimova@res.test",       "Азимова Шахло Равшановна",        "department_head", 0],
  // Аудитор + секретарь
  ["khamraev@res.test",      "Хамраев Достон Тахирович",        "auditor", 0],
  ["isakova@res.test",       "Исакова Лола Баходировна",         "admin",   0],
];

async function createUser(email, fullName, role, sharesCount) {
  // 1. Создаём auth-пользователя через Admin API
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    if (err.msg?.includes("already been registered") || err.message?.includes("already been registered")) {
      console.log(`  ⏭  ${email} — уже существует, пропускаем`);
      // Получаем ID существующего пользователя
      const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
        headers: {
          "apikey": SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      const listData = await listRes.json();
      const existing = listData.users?.find(u => u.email === email);
      if (existing) {
        await updateProfile(existing.id, fullName, role, sharesCount);
      }
      return;
    }
    console.error(`  ✗  ${email} — ОШИБКА:`, err);
    return;
  }

  const user = await res.json();
  console.log(`  ✓  ${email} — создан (${user.id})`);

  // 2. Обновляем профиль (триггер создал его с дефолтной ролью)
  await updateProfile(user.id, fullName, role, sharesCount);
}

async function updateProfile(userId, fullName, role, sharesCount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      full_name: fullName,
      role,
      shares_count: sharesCount,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`     Ошибка обновления профиля ${userId}:`, text);
  }
}

async function main() {
  console.log("=== Создание пользователей АО «РЭС» ===\n");
  console.log(`Всего: ${USERS.length} пользователей`);
  console.log(`Пароль: ${PASSWORD}\n`);

  // Также обновляем karimov (уже создан через Dashboard)
  console.log("Обновляем karimov@res.test (создан ранее)...");
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const listData = await listRes.json();
  const karimov = listData.users?.find(u => u.email === "karimov@res.test");
  if (karimov) {
    await updateProfile(karimov.id, "Каримов Бахтиёр Рахимович", "chairman", 1500000);
    console.log("  ✓  karimov@res.test — профиль обновлён\n");
  }

  // Создаём остальных
  for (const [email, fullName, role, shares] of USERS) {
    await createUser(email, fullName, role, shares);
  }

  console.log("\n=== Готово! ===");
  console.log("Все пользователи могут входить с паролем: Test1234!");
}

main().catch(console.error);
