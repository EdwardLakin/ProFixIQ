"use client";

import { useState } from "react";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";
import Card from "@shared/components/ui/Card";
import { Textarea } from "@shared/components/ui/textarea";

type ChatResponse = {
  error?: string;
  response?: string;
};

export default function TechBot(): JSX.Element {
  const { vehicleInfo } = useVehicleInfo();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAskTechBot = async (): Promise<void> => {
    setLoading(true);
    setResponse("");
    setError("");

    try {
      if (
        !vehicleInfo ||
        !vehicleInfo.make ||
        !vehicleInfo.model ||
        !vehicleInfo.year
      ) {
        setError("Please select a vehicle first.");
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle: vehicleInfo,
          input,
        }),
      });

      const data = (await res.json()) as ChatResponse;

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setResponse(data.response || "");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-4">

      <Card className="space-y-4 border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-2 text-xl font-header text-accent">
          TechBot Diagnostic Assistant
        </h2>

        <p className="text-sm text-muted-foreground">
          TechBot is your AI-powered repair assistant. Ask about fault codes,
          symptoms, or diagnostic procedures. It factors in your selected
          vehicle and responds like a seasoned technician.
        </p>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the issue or enter a DTC code..."
          className="bg-background"
        />

        <Button onClick={handleAskTechBot} disabled={loading || !input.trim()}>
          {loading ? "Analyzing..." : "Ask TechBot"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {response ? (
          <Textarea
            value={response}
            readOnly
            className="h-64 border-muted bg-muted text-sm"
          />
        ) : null}
      </Card>
    </div>
  );
}