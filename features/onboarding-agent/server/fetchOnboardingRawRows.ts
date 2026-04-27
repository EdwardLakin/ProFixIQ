const PAGE_SIZE = 1000;

export async function fetchOnboardingRawRows(params: {
  sb: any;
  shopId: string;
  sessionId: string;
  select: string;
  fileIds?: string[];
}) {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    let query = params.sb
      .from("onboarding_raw_rows")
      .select(params.select)
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .order("file_id", { ascending: true })
      .order("source_row_index", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (params.fileIds?.length) {
      query = query.in("file_id", params.fileIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
