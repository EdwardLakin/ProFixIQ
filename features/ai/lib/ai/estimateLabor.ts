export async function estimateLabor(
  complaint: string,
  jobType: string,
): Promise<number | null> {
  try {
    const res = await fetch("/api/ai/estimate-labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaint, jobType }),
    });

    const data = await res.json();
    return data.hours ?? null;
  } catch (err) {
    console.error("Error estimating labor:", err);
    return null;
  }
}
