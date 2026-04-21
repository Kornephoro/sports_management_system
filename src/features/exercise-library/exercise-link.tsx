"use client";

import Link from "next/link";

type ExerciseNameLinkProps = {
  name: string;
  exerciseLibraryItemId?: string | null;
  className?: string;
  unknownHintClassName?: string;
};

export function ExerciseNameLink({
  name,
  exerciseLibraryItemId,
  className,
  unknownHintClassName,
}: ExerciseNameLinkProps) {
  const trimmedName = name.trim();

  if (!exerciseLibraryItemId) {
    return (
      <span className={className}>
        {trimmedName}
        <span className={unknownHintClassName ?? "ml-1 text-xs text-zinc-500"}>（未关联动作库）</span>
      </span>
    );
  }

  return (
    <Link
      href={`/exercise-library/${exerciseLibraryItemId}`}
      className={className ?? "text-blue-700 underline"}
    >
      {trimmedName}
    </Link>
  );
}

