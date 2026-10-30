"""Plot measured representative paths. Does not simulate or smooth positions."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

REPO = Path(__file__).resolve().parents[2]
source = REPO / (sys.argv[1] if len(sys.argv) > 1 else "output/drift-qa/line-clutch-final-s37-all-summary.json")
study = json.loads(source.read_text(encoding="utf-8"))
assert study["status"] == "completed"
assert len(study["results"]) in (8, 24)

# Importing geometry is read-only and never invokes physics or a grip search.
script = "const t=require('./evolving_drift/track.js').get(process.argv[1]);process.stdout.write(JSON.stringify({boundary:t.boundaryPolygons,excluded:t.excludedPolygons}));"
geometry = json.loads(subprocess.check_output(["node", "-e", script, study["config"]["track"]], cwd=REPO))
vehicles = [
    ("porter-lpg-mt", "Porter LPG MT"),
    ("gr86-2.4-rz-mt", "GR86 MT"),
    ("supra-3.0t-rz", "Supra RZ AT"),
    ("ioniq5-standard", "Ioniq 5 Standard"),
]
fig, axes = plt.subplots(2, 2, figsize=(12, 12), layout="constrained")
fig.set_facecolor("#f7f9f7")
hashes = {}
for ax, (vehicle, label) in zip(axes.flat, vehicles):
    ax.set_facecolor("#f7f9f7")
    for poly in geometry["boundary"]:
        ax.add_patch(Polygon([(p["x"], p["y"]) for p in poly], facecolor="#d8dfda", edgecolor="#a4b0a8", linewidth=.6, zorder=0))
    for poly in geometry["excluded"]:
        ax.add_patch(Polygon([(p["x"], p["y"]) for p in poly], facecolor="#f7f9f7", edgecolor="#b9c4bd", linewidth=.5, zorder=1))
    for enabled, color in [(False, "#c9782b"), (True, "#087869")]:
        job = next(j for j in study["results"] if j["phase"] == "paired" and j["vehicle"] == vehicle and j["trajectorySearch"]["enabled"] == enabled)
        best_file = REPO / job["best"]
        raw = best_file.read_bytes()
        hashes[job["best"]] = hashlib.sha256(raw).hexdigest()
        best = json.loads(raw)
        frames = best["frames"]
        assert frames and best["result"]["status"] == "finished"
        arm = "ON" if enabled else "OFF"
        ax.plot([f["x"] for f in frames], [f["y"] for f in frames], color=color,
                linewidth=1.1, alpha=.88, label=f"{arm}  score {job['score']:.2f}", zorder=3 if enabled else 2)
        if enabled:
            ax.scatter([frames[0]["x"]], [frames[0]["y"]], s=28, color="#263f35", zorder=5)
            ax.scatter([frames[-1]["x"]], [frames[-1]["y"]], s=36, marker="s", color="#263f35", zorder=5)
    ax.set(title=label, xlabel="x (m)", ylabel="y (m)", aspect="equal", xlim=(-235, 40), ylim=(-35, 295))
    ax.grid(alpha=.17, linewidth=.5)
    ax.legend(loc="upper right", fontsize=9, framealpha=.94)
    for spine in ax.spines.values():
        spine.set_color("#bac7bd")

fig.suptitle(f"Actual highest-score completed paths | {study['config']['pairBudget']} evaluations per arm, seed {study['config']['seed']}\nKIC T21 · start: circle, finish: square · no smoothing", fontsize=14)
stem = sys.argv[2] if len(sys.argv) > 2 else "line-clutch-20261030-initial"
assert all(c.isalnum() or c in "-_" for c in stem)
out = REPO / f"evolving_drift/test-results/{stem}-paths.png"
fig.savefig(out, dpi=170, facecolor=fig.get_facecolor())
plt.close(fig)
manifest = {"method": "Original recorded vehicle center XY frames, plotted without smoothing. Gray physical surface polygons minus exclusions. No trajectory heading, slip angle or connection success inferred from the plot.", "sourceSummarySha256": hashlib.sha256(source.read_bytes()).hexdigest(), "bestReplaySha256": hashes, "outputSha256": hashlib.sha256(out.read_bytes()).hexdigest()}
manifest_path = out.with_suffix(".json")
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"plot": str(out), "manifest": str(manifest_path)}))
