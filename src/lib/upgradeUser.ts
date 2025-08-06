type UpgradeResponse = {
  success: boolean;
  message?: string;
  upgradedPlan?: string;
};

export async function autoUpgradeUser(
  userId: string,
  newPlan: string
): Promise<UpgradeResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_AUTO_UPGRADE_USER_URL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        plan: newPlan,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('User upgrade failed');
  }

  const result: UpgradeResponse = await response.json();
  return result;
}
