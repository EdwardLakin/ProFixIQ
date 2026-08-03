import "server-only";

type EvidenceStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
};

type EvidenceStorageObject = {
  work_order_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

export function isCanonicalEvidenceStorageObject(
  media: EvidenceStorageObject,
): media is EvidenceStorageObject & {
  storage_bucket: "job-photos";
  storage_path: string;
} {
  if (media.storage_bucket !== "job-photos" || !media.storage_path) {
    return false;
  }

  const parts = media.storage_path.split("/");

  return (
    parts.length === 5 &&
    parts[0] === "wo" &&
    parts[1] === media.work_order_id &&
    parts[2] === "lines" &&
    Boolean(parts[3]) &&
    Boolean(parts[4])
  );
}

export function sanitizeEvidenceFallbackUrl(value: string | null): string | null {
  if (!value) return null;

  if (value.startsWith("/storage/v1/object/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export async function resolveEvidenceDisplayUrl(
  admin: EvidenceStorageClient,
  media: EvidenceStorageObject & { url: string | null },
): Promise<string | null> {
  if (isCanonicalEvidenceStorageObject(media)) {
    const { data, error } = await admin.storage
      .from(media.storage_bucket)
      .createSignedUrl(media.storage_path, 60 * 60);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }

  return sanitizeEvidenceFallbackUrl(media.url);
}
