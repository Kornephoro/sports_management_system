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

analysis = []
for p in paths:
    bbox = get_bbox(p['d'])
    if not bbox: continue
    xmin, xmax, ymin, ymax = bbox
    
    # Check for multiple figures
    has_front = xmin < 512
    has_back = xmax > 512
    
    view = "Joint" if (has_front and has_back) else ("Front" if has_front else "Back")
    
    analysis.append({
        "index": p['index'],
        "view": view,
        "ymin": ymin,
        "ymax": ymax,
        "xmin": xmin,
        "xmax": xmax
    })

# Output sorted by view and ymin
analysis.sort(key=lambda x: (x['view'], x['ymin']))

with open('scratch/path_analysis.json', 'w') as f:
    json.dump(analysis, f, indent=2)

for a in analysis:
    print(f"Index {a['index']}: {a['view']} (y: {int(a['ymin'])}-{int(a['ymax'])}) x:({int(a['xmin'])}-{int(a['xmax'])})")
