#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_standards_keys(content: str):
    pattern = re.compile(r'export const MUSCLE_REGION_VALUES = \[(.*?)\] as const;', re.S)
    match = pattern.search(content)
    if not match:
        raise RuntimeError("未找到 MUSCLE_REGION_VALUES 定义。")
    values = re.findall(r'"([a-z_]+)"', match.group(1))
    return values


def extract_definition_keys(content: str):
    return re.findall(r'region:\s*"([a-z_]+)"', content)


def main():
    root = Path(__file__).resolve().parents[2]
    standards_path = root / "src" / "lib" / "exercise-library-standards.ts"
    defs_path = (
        root
        / "src"
        / "features"
        / "exercise-library"
        / "components"
        / "muscle-map"
        / "muscle-region-definitions.ts"
    )

    standards = extract_standards_keys(read_text(standards_path))
    definition_keys = sorted(set(extract_definition_keys(read_text(defs_path))))

    standards_set = set(standards)
    def_set = set(definition_keys)

    illegal = sorted(def_set - standards_set)
    missing = sorted(standards_set - def_set)

    if illegal:
        raise RuntimeError(f"肌群图存在非法 key: {', '.join(illegal)}")
    if missing:
        raise RuntimeError(f"肌群图缺失 key: {', '.join(missing)}")

    print("肌群定义校验通过：19 个标准肌群 key 已全部覆盖。")


if __name__ == "__main__":
    main()

