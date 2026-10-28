---
title: SmartSched preference model
sdk: gradio
sdk_version: 5.49.1
python_version: "3.12"
app_file: app.py
pinned: false
---

The SmartSched preference model: reads a student's planner history and returns how they like to schedule
their week, as JSON. Runs on ZeroGPU. Called only by the SmartSched server. The source lives in the
SmartSched repo under `ml/serve` (copied here by `ml/serve/build_space.sh`); edit it there, not here.
