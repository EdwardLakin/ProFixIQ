export function capabilities(role: string | null) {
  const r = (role || "").toLowerCase();
  const staff = new Set(["owner","admin","manager","advisor","tech"]);
  return {
    canView: true,
    canEditWoMeta: ["owner","admin","manager","advisor"].includes(r),
    canTechOps: ["tech","manager"].includes(r),
    canAddJobs: staff.has(r),
    canGenerateQuote: staff.has(r),
  };
}
