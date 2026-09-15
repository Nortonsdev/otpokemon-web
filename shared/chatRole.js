/** Papéis de moderação do chat: user (padrão), mod, admin. */
export function normalizeChatRole(role) {
  if (role === "admin" || role === "mod") return role;
  return "user";
}

export function isChatStaff(role) {
  const r = normalizeChatRole(role);
  return r === "admin" || r === "mod";
}
