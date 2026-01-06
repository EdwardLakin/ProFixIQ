// features/integrations/ai/shopBoost/classifyJobTypeScope.ts
export type JobClassificationInput = {
  key: string;
  occurredAt: string | null;
  vehicle: {
    year: number | null;
    make: string;
    model: string;
    vin: string;
  };
  text: {
    complaint: string;
    cause: string;
    correction: string;
    description: string;
    joined: string;
  };
  totals: {
    laborHours: number | null;
    laborTotal: number | null;
    partsTotal: number | null;
    total: number | null;
  };
  techName: string | null;
  raw: Record<string, unknown>;
};

export type JobClassificationResult = {
  key: string;
  occurredAt: string | null;
  jobType: string; // canonical bucket
  jobScope: string; // human friendly scope
  confidence: number; // 0..1
  signals: string[];
  totals: JobClassificationInput["totals"];
};

type Options = {
  shopSpecialty: "general" | "diesel" | "hd" | "mixed" | string;
};

/**
 * RULE-FIRST classifier. If confidence < threshold and OPENAI_API_KEY exists,
 * you can extend this to call your existing AI integration.
 *
 * For now this creates accurate structure + stable taxonomy without needing model calls.
 */
export async function classifyJobTypeScopeBatch(
  inputs: JobClassificationInput[],
  opts: Options,
): Promise<JobClassificationResult[]> {
  return inputs.map((x) => classifyOne(x, opts));
}

function classifyOne(
  input: JobClassificationInput,
  opts: Options,
): JobClassificationResult {
  const text = input.text.joined.toLowerCase();

  const signals: string[] = [];
  const hit = (label: string, ...needles: string[]) => {
    for (const n of needles) {
      if (text.includes(n)) {
        signals.push(`${label}:${n}`);
        return true;
      }
    }
    return false;
  };

  // ---- DIESEL/HD specific first (more distinct)
  if (
    hit(
      "aftertreatment",
      "dpf",
      "regen",
      "scr",
      "def",
      "nox",
      "derate",
      "aftertreatment",
    )
  ) {
    return mk(input, "aftertreatment", "Aftertreatment / DPF / SCR / DEF", 0.92, signals);
  }

  if (hit("airbrake", "brake chamber", "slack adjust", "s-cam", "air leak", "air brake")) {
    return mk(input, "brakes", "Air brake system service/repair", 0.88, signals);
  }

  if (
    hit(
      "driveline",
      "u-joint",
      "ujoint",
      "carrier bearing",
      "driveshaft",
      "diff",
      "differential",
    )
  ) {
    return mk(input, "driveline", "Driveline / driveshaft / differential repair", 0.86, signals);
  }

  // ---- Common buckets
  if (hit("pm", "oil", "lof", "lube", "service a", "service b", "pm ", "preventive")) {
    const scope = text.includes("coolant")
      ? "PM service + coolant check"
      : "PM service / oil change + inspection";
    return mk(input, "maintenance", scope, 0.84, signals);
  }

  if (
    hit(
      "brakes",
      "pads",
      "rotor",
      "caliper",
      "brake job",
      "brake noise",
      "pulling when braking",
    )
  ) {
    const scope =
      text.includes("rotor") || text.includes("pads")
        ? "Brake service – pads/rotors/calipers"
        : "Brake diagnosis/repair";
    return mk(input, "brakes", scope, 0.82, signals);
  }

  if (hit("tires", "tire", "balance", "alignment", "rotate", "tpms")) {
    const scope = text.includes("alignment")
      ? "Alignment / steering angle correction"
      : "Tire service / mount & balance";
    return mk(input, "tires", scope, 0.8, signals);
  }

  if (
    hit(
      "suspension",
      "shock",
      "strut",
      "ball joint",
      "control arm",
      "leaf spring",
      "bushing",
    )
  ) {
    return mk(input, "suspension", "Suspension / steering component repair", 0.8, signals);
  }

  if (
    hit(
      "electrical",
      "no crank",
      "no start",
      "starter",
      "alternator",
      "battery",
      "short",
      "parasitic",
    )
  ) {
    const scope = text.includes("alternator")
      ? "Charging system – alternator diagnosis/replace"
      : text.includes("starter")
        ? "Starting system – starter diagnosis/replace"
        : "Electrical diagnosis/repair";
    return mk(input, "electrical", scope, 0.8, signals);
  }

  if (hit("cooling", "overheat", "coolant", "radiator", "water pump", "thermostat")) {
    return mk(input, "cooling", "Cooling system diagnosis/repair", 0.8, signals);
  }

  if (hit("hvac", "a/c", "ac ", "air conditioning", "compressor", "refrigerant")) {
    return mk(input, "hvac", "HVAC / A/C diagnosis/repair", 0.8, signals);
  }

  if (hit("engine", "misfire", "rough idle", "injector", "turbo", "compression", "knock")) {
    return mk(input, "engine", "Engine performance diagnosis/repair", 0.78, signals);
  }

  if (hit("transmission", "trans", "shift", "clutch", "torque converter")) {
    return mk(input, "transmission", "Transmission / clutch diagnosis/repair", 0.78, signals);
  }

  if (hit("inspection", "inspection", "pm inspection", "dot inspection", "safety inspection")) {
    const scope = text.includes("dot") ? "DOT / compliance inspection" : "Inspection / multi-point";
    return mk(input, "inspection", scope, 0.76, signals);
  }

  // fallback
  const specialtyHint = typeof opts.shopSpecialty === "string" ? opts.shopSpecialty : "general";
  const scope =
    specialtyHint.includes("diesel") || specialtyHint.includes("hd")
      ? "General heavy-duty service/repair"
      : "General service/repair";

  return mk(input, "general", scope, 0.55, signals.length ? signals : ["fallback"]);
}

function mk(
  input: JobClassificationInput,
  jobType: string,
  jobScope: string,
  confidence: number,
  signals: string[],
): JobClassificationResult {
  return {
    key: input.key,
    occurredAt: input.occurredAt,
    jobType,
    jobScope,
    confidence: clamp01(confidence),
    signals,
    totals: input.totals,
  };
}

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}