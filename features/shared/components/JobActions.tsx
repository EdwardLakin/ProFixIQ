"use client";

import React from "react";

import { Button } from "@shared/components/ui/Button";

type JobActionsProps = {
  status: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  isOnHold: boolean;
  isCompleted: boolean;
};

export const JobActions: React.FC<JobActionsProps> = ({
  status,
  onStart,
  onPause,
  onResume,
  onComplete,
  isOnHold,
  isCompleted,
}) => {
  return (
    <div className="flex gap-2 mt-2">
      {status === "not_started" && (
        <Button onClick={onStart} className="bg-blue-600 text-white">
          Start Job
        </Button>
      )}

      {status === "in_progress" && (
        <>
          <Button onClick={onPause} className="bg-yellow-500 text-black">
            Pause
          </Button>
          <Button onClick={onComplete} className="bg-green-600 text-white">
            Complete
          </Button>
        </>
      )}

      {isOnHold && status === "on_hold" && (
        <Button onClick={onResume} className="bg-blue-500 text-white">
          Resume
        </Button>
      )}

      {isCompleted && (
        <span className="text-green-600 font-semibold">✅ Completed</span>
      )}
    </div>
  );
};
