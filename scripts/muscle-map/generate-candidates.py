#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

VIEW_WIDTH = 160
VIEW_HEIGHT = 300

REGION_KEYS = [
    "upper_chest",
    "chest",
    "lower_chest",
    "front_delt",
    "mid_delt",
    "rear_delt",
    "upper_back",
    "lats",
    "lower_back",
    "biceps",
    "triceps",
    "forearm",
    "abs",
    "obliques",
    "glutes",
    "quads",
    "hamstrings",
    "adductors",
    "calves",
]


def _round_point(point: Tuple[float, float]) -> Dict[str, float]:
    return {"x": round(float(point[0]), 2), "y": round(float(point[1]), 2)}


def _to_view(points: List[Tuple[float, float]]) -> List[Dict[str, float]]:
    return [_round_point(point) for point in points]


def _mirror(points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    return [(1.0 - x, y) for x, y in points]


def _scaled(points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    return [(x * VIEW_WIDTH, y * VIEW_HEIGHT) for x, y in points]


def _pair(points: List[Tuple[float, float]]) -> List[List[Dict[str, float]]]:
    left = _to_view(_scaled(points))
    right = _to_view(_scaled(_mirror(points)))
    return [left, right]


def _single(points: List[Tuple[float, float]]) -> List[List[Dict[str, float]]]:
    return [_to_view(_scaled(points))]


def _init_region_map() -> Dict[str, List[List[Dict[str, float]]]]:
    return {key: [] for key in REGION_KEYS}


def build_front_regions() -> Dict[str, List[List[Dict[str, float]]]]:
    regions = _init_region_map()
    regions["upper_chest"] = _pair([(0.35, 0.20), (0.42, 0.17), (0.48, 0.20), (0.46, 0.25), (0.36, 0.25)])
    regions["chest"] = _pair([(0.33, 0.25), (0.42, 0.24), (0.48, 0.28), (0.46, 0.34), (0.36, 0.34)])
    regions["lower_chest"] = _pair([(0.35, 0.34), (0.46, 0.34), (0.44, 0.40), (0.36, 0.40)])
    regions["front_delt"] = _pair([(0.27, 0.23), (0.31, 0.21), (0.34, 0.28), (0.30, 0.32), (0.26, 0.29)])
    regions["mid_delt"] = _pair([(0.24, 0.29), (0.30, 0.30), (0.31, 0.36), (0.26, 0.38), (0.23, 0.33)])
    regions["biceps"] = _pair([(0.24, 0.37), (0.30, 0.37), (0.31, 0.46), (0.26, 0.50), (0.23, 0.44)])
    regions["triceps"] = _pair([(0.30, 0.37), (0.33, 0.40), (0.32, 0.49), (0.28, 0.52), (0.27, 0.44)])
    regions["forearm"] = _pair([(0.22, 0.50), (0.27, 0.50), (0.29, 0.62), (0.25, 0.66), (0.21, 0.58)])
    regions["abs"] = _single([(0.44, 0.37), (0.56, 0.37), (0.57, 0.57), (0.50, 0.62), (0.43, 0.57)])
    regions["obliques"] = _pair([(0.37, 0.39), (0.43, 0.39), (0.44, 0.56), (0.39, 0.58), (0.35, 0.49)])
    regions["quads"] = _pair([(0.38, 0.62), (0.46, 0.62), (0.47, 0.78), (0.40, 0.83), (0.36, 0.74)])
    regions["adductors"] = _pair([(0.47, 0.62), (0.50, 0.62), (0.51, 0.78), (0.49, 0.83), (0.46, 0.74)])
    regions["calves"] = _pair([(0.40, 0.83), (0.46, 0.83), (0.47, 0.95), (0.42, 0.98), (0.39, 0.91)])
    return regions


def build_back_regions() -> Dict[str, List[List[Dict[str, float]]]]:
    regions = _init_region_map()
    regions["rear_delt"] = _pair([(0.27, 0.23), (0.32, 0.22), (0.34, 0.29), (0.30, 0.32), (0.26, 0.29)])
    regions["mid_delt"] = _pair([(0.24, 0.29), (0.30, 0.30), (0.31, 0.36), (0.26, 0.38), (0.23, 0.33)])
    regions["upper_back"] = _single([(0.36, 0.22), (0.64, 0.22), (0.67, 0.36), (0.50, 0.42), (0.33, 0.36)])
    regions["lats"] = _pair([(0.34, 0.34), (0.40, 0.34), (0.43, 0.54), (0.36, 0.60), (0.32, 0.49)])
    regions["lower_back"] = _single([(0.44, 0.43), (0.56, 0.43), (0.58, 0.57), (0.50, 0.63), (0.42, 0.57)])
    regions["triceps"] = _pair([(0.24, 0.37), (0.30, 0.37), (0.31, 0.46), (0.26, 0.50), (0.23, 0.44)])
    regions["biceps"] = _pair([(0.30, 0.37), (0.33, 0.40), (0.32, 0.49), (0.28, 0.52), (0.27, 0.44)])
    regions["forearm"] = _pair([(0.22, 0.50), (0.27, 0.50), (0.29, 0.62), (0.25, 0.66), (0.21, 0.58)])
    regions["glutes"] = _pair([(0.39, 0.56), (0.47, 0.56), (0.49, 0.66), (0.42, 0.70), (0.37, 0.64)])
    regions["hamstrings"] = _pair([(0.39, 0.70), (0.47, 0.70), (0.48, 0.84), (0.42, 0.89), (0.37, 0.82)])
    regions["calves"] = _pair([(0.40, 0.84), (0.46, 0.84), (0.47, 0.95), (0.42, 0.98), (0.39, 0.91)])
    return regions


def contour_to_view_polygon(contour: np.ndarray, x: int, y: int, w: int, h: int) -> List[Dict[str, float]]:
    epsilon = 0.0035 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    points: List[Dict[str, float]] = []
    for point in approx.reshape(-1, 2):
        px = ((float(point[0]) - x) / max(w, 1)) * VIEW_WIDTH
        py = ((float(point[1]) - y) / max(h, 1)) * VIEW_HEIGHT
        points.append(_round_point((px, py)))
    return points


def find_two_body_contours(image: np.ndarray):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [c for c in contours if cv2.contourArea(c) > 18000]
    if len(candidates) < 2:
        candidates = sorted(contours, key=cv2.contourArea, reverse=True)[:2]
    if len(candidates) < 2:
        raise RuntimeError("未检测到两个人体轮廓，请检查参考图或阈值参数。")

    candidates = sorted(candidates[:2], key=lambda c: cv2.boundingRect(c)[0])
    return candidates


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _polygon_to_svg_points(polygon: List[Dict[str, float]], x_offset: float = 0.0) -> str:
    return " ".join(f"{round(point['x'] + x_offset, 2)},{point['y']}" for point in polygon)


def _build_preview_svg(
    title: str,
    regions: Dict[str, List[List[Dict[str, float]]]],
    outline: List[Dict[str, float]],
) -> str:
    width = 180
    height = 320
    colors = ["#bfdbfe", "#93c5fd", "#60a5fa", "#38bdf8", "#7dd3fc", "#a5f3fc"]
    region_nodes = []
    index = 0
    for key in REGION_KEYS:
        for polygon in regions.get(key, []):
            color = colors[index % len(colors)]
            region_nodes.append(
                f'<polygon points="{_polygon_to_svg_points(polygon, 10)}" fill="{color}" fill-opacity="0.55" stroke="#334155" stroke-width="0.6" />'
            )
            index += 1

    outline_poly = f'<polygon points="{_polygon_to_svg_points(outline, 10)}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />'

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">
  <rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>
  <text x="20" y="18" fill="#334155" font-size="12">{title}</text>
  {outline_poly}
  {"".join(region_nodes)}
</svg>"""


def main():
    project_root = Path(__file__).resolve().parents[2]
    image_path = project_root / "Gemini_Generated_Image_jms0hkjms0hkjms0.png"
    data_dir = project_root / "data" / "muscle-map"

    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f"无法读取参考图: {image_path}")

    contours = find_two_body_contours(image)
    left_contour, right_contour = contours[0], contours[1]
    lx, ly, lw, lh = cv2.boundingRect(left_contour)
    rx, ry, rw, rh = cv2.boundingRect(right_contour)

    front_payload = {
        "meta": {
            "source_image": image_path.name,
            "view": "front",
            "view_box": [0, 0, VIEW_WIDTH, VIEW_HEIGHT],
            "generated_by": "scripts/muscle-map/generate-candidates.py",
        },
        "outline_polygon": contour_to_view_polygon(left_contour, lx, ly, lw, lh),
        "regions": build_front_regions(),
    }
    back_payload = {
        "meta": {
            "source_image": image_path.name,
            "view": "back",
            "view_box": [0, 0, VIEW_WIDTH, VIEW_HEIGHT],
            "generated_by": "scripts/muscle-map/generate-candidates.py",
        },
        "outline_polygon": contour_to_view_polygon(right_contour, rx, ry, rw, rh),
        "regions": build_back_regions(),
    }

    write_json(data_dir / "front-candidates.json", front_payload)
    write_json(data_dir / "back-candidates.json", back_payload)

    front_preview_svg = _build_preview_svg(
        "前视候选覆盖",
        front_payload["regions"],
        front_payload["outline_polygon"],
    )
    back_preview_svg = _build_preview_svg(
        "后视候选覆盖",
        back_payload["regions"],
        back_payload["outline_polygon"],
    )
    (data_dir / "preview-front.svg").write_text(front_preview_svg, encoding="utf-8")
    (data_dir / "preview-back.svg").write_text(back_preview_svg, encoding="utf-8")

    print("Muscle map candidates generated:")
    print(data_dir / "front-candidates.json")
    print(data_dir / "back-candidates.json")
    print(data_dir / "preview-front.svg")
    print(data_dir / "preview-back.svg")


if __name__ == "__main__":
    main()
