export type InspectionRuntimeParams = Record<string, string>;

export function mergeInspectionRuntimeParams(args: {
  staged?: InspectionRuntimeParams | null;
  route?: InspectionRuntimeParams | null;
  props?: Record<string, string | number | boolean | null | undefined> | null;
}): InspectionRuntimeParams {
  const merged: InspectionRuntimeParams = {
    ...(args.staged ?? {}),
    ...(args.route ?? {}),
  };

  Object.entries(args.props ?? {}).forEach(([key, value]) => {
    if (value != null) merged[key] = String(value);
  });

  return merged;
}
