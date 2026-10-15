// Vytvoří prvního správce.
// Použití: node --env-file=.env.local scripts/create-admin.mjs email@firma.cz "Jméno Příjmení" "heslo"
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password] = process.argv.slice(2);
if (!email || !fullName || !password) {
  console.error('Použití: node --env-file=.env.local scripts/create-admin.mjs email "Jméno" heslo');
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error("Uživatele se nepodařilo vytvořit:", error.message);
  process.exit(1);
}
const { error: pErr } = await db
  .from("profiles")
  .insert({ id: data.user.id, role: "admin", email: email.toLowerCase(), full_name: fullName });
if (pErr) {
  console.error("Profil se nepodařilo vytvořit:", pErr.message);
  process.exit(1);
}
console.log(`Správce ${email} vytvořen. Přihlaste se na /login.`);
