"use client";

let svgTemplatePromise: Promise<string> | null = null;

export async function getMuscleAnatomySvgTemplate() {
  if (!svgTemplatePromise) {
    svgTemplatePromise = fetch("/muscle_anotomy/human_male_manual_split.svg", {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`load failed: ${response.status}`);
        }
        return response.text();
      })
      .catch((error) => {
        svgTemplatePromise = null;
        throw error;
      });
  }

  return svgTemplatePromise;
}
