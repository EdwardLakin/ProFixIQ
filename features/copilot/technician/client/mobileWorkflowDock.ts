export type MobileWorkflowDock = "job" | "work-order" | null;

const MOBILE_WORKFLOW_DOCK_ATTRIBUTE = "data-mobile-workflow-dock";
const MOBILE_WORKFLOW_DOCK_OWNER_ATTRIBUTE =
  "data-mobile-workflow-dock-owner";
const MOBILE_WORKFLOW_DOCK_CHANGE_EVENT =
  "profixiq:mobile-workflow-dock-change";

let nextRegistrationId = 0;

function notifyWorkflowDockChanged(): void {
  window.dispatchEvent(new Event(MOBILE_WORKFLOW_DOCK_CHANGE_EVENT));
}

export function getMobileWorkflowDock(): MobileWorkflowDock {
  if (typeof document === "undefined") return null;
  const dock = document.body.getAttribute(MOBILE_WORKFLOW_DOCK_ATTRIBUTE);
  return dock === "job" || dock === "work-order" ? dock : null;
}

export function subscribeToMobileWorkflowDock(
  onStoreChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(MOBILE_WORKFLOW_DOCK_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(MOBILE_WORKFLOW_DOCK_CHANGE_EVENT, onStoreChange);
}

export function registerMobileWorkflowDock(
  dock: Exclude<MobileWorkflowDock, null>,
): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => undefined;
  }

  nextRegistrationId += 1;
  const registrationId = String(nextRegistrationId);
  document.body.setAttribute(MOBILE_WORKFLOW_DOCK_ATTRIBUTE, dock);
  document.body.setAttribute(
    MOBILE_WORKFLOW_DOCK_OWNER_ATTRIBUTE,
    registrationId,
  );
  notifyWorkflowDockChanged();

  return () => {
    if (
      document.body.getAttribute(MOBILE_WORKFLOW_DOCK_OWNER_ATTRIBUTE) !==
      registrationId
    ) {
      return;
    }
    document.body.removeAttribute(MOBILE_WORKFLOW_DOCK_ATTRIBUTE);
    document.body.removeAttribute(MOBILE_WORKFLOW_DOCK_OWNER_ATTRIBUTE);
    notifyWorkflowDockChanged();
  };
}
