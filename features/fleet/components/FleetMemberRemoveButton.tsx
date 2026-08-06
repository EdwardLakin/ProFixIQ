"use client";

export default function FleetMemberRemoveButton() {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (
          !window.confirm(
            "Remove this user from the Fleet workspace? Their Shop access, if any, is unchanged.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="h-10 w-full rounded-xl border border-red-400/30 px-3 text-xs font-semibold text-red-700 dark:text-red-200"
    >
      Remove
    </button>
  );
}
