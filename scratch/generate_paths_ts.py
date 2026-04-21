import json
import re

def get_bbox(d):
    coords = re.findall(r'([+-]?[\d.]+)\s+([+-]?[\d.]+)', d)
    if not coords:
        return None
    xs = [float(c[0]) for c in coords]
    ys = [float(c[1]) for c in coords]
    return min(xs), max(xs), min(ys), max(ys)

with open('scratch/extracted_paths.json', 'r') as f:
    paths = json.load(f)

mappings = {
    "neck": [75],
    "chest_upper": [2],
    "chest_mid_lower": [65],
    "traps_mid_upper": [4],
    "rhomboids": [38, 42],
    "rotator_cuff": [46, 50, 51, 52],
    "lats": [72],
    "erector_spinae": [43],
    "delt_front": [76, 77],
    "delt_mid": [53],
    "delt_rear": [54, 55, 56, 57],
    "biceps_inner": [60, 61],
    "biceps_outer": [58, 59, 62],
    "triceps": [66, 67, 68, 69],
    "forearms": [63],
    "abs": [64],
    "obliques": [73],
    "glutes_max": [71],
    "glutes_med": [47],
    "adductors": [76],
    "quads": [70],
    "it_band": [72],
    "hamstrings": [79],
    "calves": [74, 80]
}

def get_d(idx):
    for p in paths:
        if p['index'] == idx: return p['d']
    return ""

def get_anchor(indices):
    xs = []
    ys = []
    for idx in indices:
        d = get_d(idx)
        bbox = get_bbox(d)
        if bbox:
            xs.extend([bbox[0], bbox[1]])
            ys.extend([bbox[2], bbox[3]])
    if not xs: return None
    return {"x": sum(xs)/len(xs), "y": sum(ys)/len(ys)}

with open('scratch/path_analysis.json', 'r') as f:
    analysis = json.load(f)

view_map = {a['index']: a['view'] for a in analysis}

front_body = get_d(1)
back_body = get_d(0)

# Collect output
output = []
output.append("import { MuscleRegionV1 } from '@/lib/exercise-library-standards';")
output.append("\nexport type AnatomicalPath = {")
output.append("  region: MuscleRegionV1;")
output.append("  paths: string[];")
output.append("};")
output.append("\nexport type MuscleLabelMeta = {")
output.append("  region: MuscleRegionV1;")
output.append("  anchorFront?: { x: number; y: number };")
output.append("  anchorBack?: { x: number; y: number };")
output.append("  labelOffset?: { x: number; y: number };")
output.append("};")
output.append("\nexport const FRONT_BODY_OUTLINE = '" + front_body + "';")
output.append("export const BACK_BODY_OUTLINE = '" + back_body + "';")

output.append("\nexport const FRONT_ANATOMICAL_REGIONS: AnatomicalPath[] = [")
for region, indices in mappings.items():
    ps = [get_d(i) for i in indices]
    views = [view_map.get(i, "Front") for i in indices]
    if any(v == "Front" or v == "Joint" for v in views):
        output.append(f"  {{ region: '{region}', paths: {json.dumps(ps)} }},")
output.append("];")

output.append("\nexport const BACK_ANATOMICAL_REGIONS: AnatomicalPath[] = [")
for region, indices in mappings.items():
    ps = [get_d(i) for i in indices]
    views = [view_map.get(i, "Back") for i in indices]
    if any(v == "Back" or v == "Joint" for v in views):
        output.append(f"  {{ region: '{region}', paths: {json.dumps(ps)} }},")
output.append("];")

output.append("\nexport const MUSCLE_LABEL_METADATA: MuscleLabelMeta[] = [")
for region, indices in mappings.items():
    anchor = get_anchor(indices)
    if not anchor: continue
    if anchor['x'] < 512:
        output.append(f"  {{ region: '{region}', anchorFront: {{ x: {int(anchor['x'])}, y: {int(anchor['y'])} }}, labelOffset: {{ x: 100, y: 0 }} }},")
    else:
        output.append(f"  {{ region: '{region}', anchorBack: {{ x: {int(anchor['x'])}, y: {int(anchor['y'])} }}, labelOffset: {{ x: 100, y: 0 }} }},")
output.append("];")

with open('src/features/exercise-library/components/muscle-map/anatomical-paths.ts', 'w', encoding='utf-8') as f:
    f.write("\n".join(output))

print("Updated anatomical-paths.ts")
