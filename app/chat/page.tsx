import ChatListClient from "@/features/chat/components/ChatListClient";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ChatListPageProps = {
  searchParams: Promise<{
    compose?: string;
    contextType?: string;
    contextId?: string;
    customerId?: string;
  }>;
};

export default async function ChatListPage({
  searchParams,
}: ChatListPageProps) {
  const requested = await searchParams;
  const contextId = requested.contextId?.trim() ?? "";
  const customerId = requested.customerId?.trim() ?? "";
  const contextType =
    requested.contextType === "vehicle" ||
    requested.contextType === "work_order"
      ? requested.contextType
      : null;
  const startCustomerCompose =
    requested.compose === "customer" &&
    contextType !== null &&
    UUID_PATTERN.test(contextId) &&
    UUID_PATTERN.test(customerId);

  return (
    <ChatListClient
      startCustomerCompose={startCustomerCompose}
      contextType={startCustomerCompose ? contextType : null}
      contextId={startCustomerCompose ? contextId : null}
      customerId={startCustomerCompose ? customerId : null}
    />
  );
}
