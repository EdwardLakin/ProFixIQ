// src/lib/upgradeUser.ts

export async function autoUpgradeUser(
  userId: string,
  newPlan: string,
): Promise<any> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_AUTO_UPGRADE_USER_URL}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        plan: newPlan,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("User upgrade failed");
  }

  const result = await response.json();
  return result;
}
