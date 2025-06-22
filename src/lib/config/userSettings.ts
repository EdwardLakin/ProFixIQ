export async function getUserSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("shop_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Shop settings not found.");
  return data as UserSettings;
}

export const userSettings = {
  laborRate: 120,
  partsMarkup: 1.3,
  shopSuppliesFlatFee: 5.0,
};