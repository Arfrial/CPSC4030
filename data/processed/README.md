# CellScope processed data

Source: course-provided CPSC4030_6030_data ZIP, all 25 GT field CSVs. No algorithm output or duplicate example files are included. Regenerate from the repository root with `py scripts/preprocess.py "path/to/original.zip"` (Python 3.9+; standard library only).

- `metadata.json`: global counts.
- `fields.csv`: one row per cell line and field, including relative path to field JSON.
- `tracks.csv`: one row per track, scoped by cell line and field. Duration is last frame minus first frame plus one. Mean displacement is the sum divided by valid step count, not total path length or physical speed.
- `field_frames.csv`: one row per observed frame per field. For a field-balanced cell-line time series, average the valid field means at each frame, excluding blank means. For a step-weighted mean, divide summed displacement by summed valid steps.
- `fields/*.json`: per-field observations grouped by track ID. Each row follows the `columns` array: `[frame, x, y, displacement, lifecycle, division, cell_id, parent_id, child_ids, target_spot_id]`. Division is 0 or 1; missing numbers are null. Load these files on demand for spatial trajectories or brushed-track summaries. The field paths in `fields.csv` are relative to this directory.

All observations are retained in the compact field files, but unused raw annotations are omitted. Missing displacement is excluded from movement calculations; zero displacement is valid. Positions and displacement use source pixels, frame numbers are not elapsed physical time. Track IDs and field IDs should never be treated as globally unique on their own. A track ID can represent a branching lineage: 70,811 observations share a frame with another observation in the same track (count beyond the first per frame). Do not connect frame-sorted observations into one polyline. Use the field-scoped cell IDs and source parent/child or target links to render actual edges, checking that referenced observations exist. Child IDs are semicolon-separated; -1 or empty indicates no link. Duration measures the span of the track/lineage, not necessarily one cell lifetime.

Validated totals: 25 fields, 229,890 observations, 223,969 valid steps, 3,230 tracks, and 1,335 division-marked observations.
