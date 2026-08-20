type ReplaceDocument = (destination: string) => void;

/** Rebuild the root layout when authentication crosses into the protected app. */
export function navigateAfterAuthentication(
  destination: string,
  replaceDocument: ReplaceDocument = window.location.replace.bind(
    window.location,
  ),
): void {
  replaceDocument(destination);
}
