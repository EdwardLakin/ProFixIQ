export type InviteCreateActionState = {
  status: "idle" | "validation-error" | "invite-created";
  message?: string;
  warning?: string;
  inviteLink?: string;
  invitedEmail?: string;
  expiresAt?: string;
};

export const initialInviteCreateActionState: InviteCreateActionState = { status: "idle" };
