// /lib/chatgptHandler.ts
export async function sendChatMessage(prompt: string, history: any[], vehicle: string | null) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        history,
        vehicle,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to get AI response");
    }

    const data = await res.json();
    return data.message;
  } catch (error) {
    console.error("Chat handler error:", error);
    return "An error occurred while communicating with TechBot.";
  }
}