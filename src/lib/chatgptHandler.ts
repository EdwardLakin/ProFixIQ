// src/lib/chatgptHandler.ts

export async function sendToChatGPT(
  prompt: string,
  context?: string,
): Promise<string> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_CHATGPT_HANDLER_URL}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        context,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("ChatGPT handler failed");
  }

  const result = await response.json();
  return result.answer || "No response received.";
}
