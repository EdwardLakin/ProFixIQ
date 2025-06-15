export async function askTechBot(prompt: string) {
  const response = await fetch("/api/ask-techbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error("Failed to get AI response");
  }

  const data = await response.json();
  return data.result as string;
}
