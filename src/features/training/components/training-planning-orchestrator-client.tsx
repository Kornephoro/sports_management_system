"use client";

import Link from "next/link";
import { useState } from "react";

import { AppCard, InlineAlert } from "@/features/shared/components/ui-primitives";
import { TrainingPlanningWizardClient } from "@/features/training/components/training-planning-wizard-client";

type TrainingPlanningOrchestratorClientProps = {
  userId: string;
};

type WizardStep = 1 | 2 | 3;

export function TrainingPlanningOrchestratorClient({ userId }: TrainingPlanningOrchestratorClientProps) {
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [reuseInitialStep, setReuseInitialStep] = useState<WizardStep>(1);


  return (
    <section className="space-y-4">
      <TrainingPlanningWizardClient
        key={`wizard:${selectedPackageId ?? "none"}:${reuseInitialStep}`}
        userId={userId}
        initialPackageId={selectedPackageId ?? undefined}
        initialStep={reuseInitialStep}
      />
    </section>
  );
}

