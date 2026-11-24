import argparse
import csv
import io
import json
import math
from collections import defaultdict
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def mean(total, count):
    return total / count if count else None


def write_csv(path, rows, columns):
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path, data):
    path.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False), encoding='utf-8')


def build(source, out):
    (out / 'fields').mkdir(parents=True, exist_ok=True)
    fields, tracks, frames = [], [], []
    with ZipFile(source) as archive:
        members = sorted(n for n in archive.namelist()
                         if '/GT/' in n and PurePosixPath(n).name.startswith('GT_FLD_')
                         and n.endswith('.csv'))
        if not members:
            raise ValueError('No ground-truth field CSVs found in ZIP')
        for member in members:
            p = PurePosixPath(member)
            line, field = p.parent.name, p.stem.removeprefix('GT_')
            field_key = f'{line}__{field}'
            by_track = defaultdict(list)
            by_frame = defaultdict(lambda: {'observations': 0, 'valid_steps': 0, 'sum_displacement': 0.0, 'divisions': 0})
            with archive.open(member) as raw:
                for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
                    frame = int(row['frame_t'])
                    d = number(row['DISPLACEMENT'])
                    if d is not None and d < 0:
                        d = None
                    division = int(row['IS_DIVISION'].strip().lower() == 'true')
                    # Keep original observation identity and positions. Missing numeric values stay null.
                    by_track[row['track_id']].append([
                        frame, number(row['position_x_t']), number(row['position_y_t']),
                        d, row['cell_lifecycle'], division, row['cell_id'],
                        row['PARENT_ID'], row['CHILD_IDS'], row['target_spot_id']])
                    stats = by_frame[frame]
                    stats['observations'] += 1
                    stats['divisions'] += division
                    if d is not None:
                        stats['valid_steps'] += 1
                        stats['sum_displacement'] += d
            valid_tracks = 0
            for track_id, rows in sorted(by_track.items()):
                rows.sort(key=lambda r: r[0])
                values = [r[3] for r in rows if r[3] is not None]
                valid_tracks += bool(values)
                tracks.append(dict(cell_line=line, field=field, field_key=field_key,
                                   track_id=track_id, track_key=f'{field_key}__{track_id}',
                                   start_frame=rows[0][0], end_frame=rows[-1][0],
                                   duration=rows[-1][0]-rows[0][0]+1,
                                   observations=len(rows), valid_steps=len(values),
                                   sum_displacement=sum(values), mean_displacement=mean(sum(values),len(values)),
                                   divisions=sum(r[5] for r in rows)))
            for frame, stats in sorted(by_frame.items()):
                frames.append(dict(cell_line=line, field=field, field_key=field_key, frame=frame,
                                   **stats, mean_displacement=mean(stats['sum_displacement'],stats['valid_steps'])))
            totals = {k:sum(v[k] for v in by_frame.values()) for k in ('observations','valid_steps','sum_displacement','divisions')}
            fields.append(dict(cell_line=line, field=field, field_key=field_key, start_frame=min(by_frame),
                               end_frame=max(by_frame), tracks=len(by_track), tracks_with_valid_steps=valid_tracks,
                               **totals, mean_displacement=mean(totals['sum_displacement'], totals['valid_steps']),
                               path=f'fields/{field_key}.json'))
            write_json(out / 'fields' / f'{field_key}.json', {'cell_line':line,'field':field,
                       'columns':['frame','x','y','displacement','lifecycle','division','cell_id','parent_id','child_ids','target_spot_id'], 'tracks':by_track})
            print(f'{field_key}: {totals["observations"]:,} observations')
    for filename, rows in [('tracks.csv',tracks),('field_frames.csv',frames),('fields.csv',fields)]:
        write_csv(out / filename, rows, list(rows[0]))
    metadata = dict(cell_lines=sorted({f['cell_line'] for f in fields}), fields=len(fields),
                    observations=sum(f['observations'] for f in fields), valid_steps=sum(f['valid_steps'] for f in fields),
                    tracks=len(tracks), tracks_with_valid_steps=sum(f['tracks_with_valid_steps'] for f in fields),
                    divisions=sum(f['divisions'] for f in fields))
    write_json(out/'metadata.json',metadata)
    print(json.dumps(metadata,indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Original course dataset ZIP')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1]/'data'/'processed')
    args=parser.parse_args()
    build(args.source,args.out)
