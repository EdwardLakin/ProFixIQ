"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";

import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

const WorkspaceResourceValueContext =
  createContext<WorkspaceResourceContext | null>(null);
const WorkspaceResourcePublisherContext = createContext<
  Dispatch<SetStateAction<WorkspaceResourceContext | null>> | null
>(null);

export type WorkspaceResourceProviderProps = {
  children: ReactNode;
  initialResource?: WorkspaceResourceContext | null;
};

/**
 * Shares canonical resource identity across independently mounted workspace
 * modules. Authorization remains owned by the effective capability resolver;
 * this client context is not a security boundary.
 */
export function WorkspaceResourceProvider({
  children,
  initialResource = null,
}: WorkspaceResourceProviderProps) {
  const [resource, setResource] =
    useState<WorkspaceResourceContext | null>(initialResource);

  return (
    <WorkspaceResourcePublisherContext.Provider value={setResource}>
      <WorkspaceResourceValueContext.Provider value={resource}>
        {children}
      </WorkspaceResourceValueContext.Provider>
    </WorkspaceResourcePublisherContext.Provider>
  );
}

export function useWorkspaceResourceContext(): WorkspaceResourceContext | null {
  return useContext(WorkspaceResourceValueContext);
}

/**
 * Publishes the RLS-authorized resource loaded by a workspace screen. It is a
 * no-op outside a WorkspaceResourceProvider so isolated component previews and
 * tests keep working.
 */
export function usePublishWorkspaceResourceContext(
  resource: WorkspaceResourceContext | null,
): void {
  const publish = useContext(WorkspaceResourcePublisherContext);

  useEffect(() => {
    publish?.(resource);
  }, [publish, resource]);

  useEffect(
    () => () => {
      publish?.(null);
    },
    [publish],
  );
}
