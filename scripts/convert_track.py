"""Regenerate the prototype track from previously extracted APK data."""
import json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
source = project.parent / "analysis/extracted/assets/monkey/data/short_track_01_lane.json"
data = json.loads(source.read_text(encoding="utf-8"))
converted = {
    "id": "farm-river-sprint",
    "name": "Farm River",
    "source": "short_track_01_lane.json from race-time-1-0-6.apk",
    "lanes": [
        [[round(point["x"] / 100, 2), round(point["y"] / 100, 2)] for point in lane["path"]]
        for lane in data["lanes"]
    ],
}
destination = project / "src/data/farm-river.json"
destination.write_text(json.dumps(converted, separators=(",", ":")), encoding="utf-8")
print(f"Converted {len(converted['lanes'])} lanes into {destination.name}")
