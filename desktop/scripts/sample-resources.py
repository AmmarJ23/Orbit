"""Sample known Orbit/WebKit PIDs; reports CPU time deltas and resident memory."""
import argparse
import json
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--pids', required=True)
parser.add_argument('--label', required=True)
parser.add_argument('--duration', type=int, default=60)
parser.add_argument('--output', required=True)
args = parser.parse_args()


def cpu_seconds(value):
    days, _, clock = value.rpartition('-')
    seconds = 0.0
    for part in clock.split(':'):
        seconds = seconds * 60 + float(part)
    return seconds + (int(days) * 86400 if days else 0)


def sample():
    result = subprocess.run(['ps', '-o', 'pid=,time=,rss=,comm=', '-p', args.pids],
                            capture_output=True, text=True, check=True)
    processes = {}
    for line in result.stdout.splitlines():
        pid, cpu, rss, command = line.split(None, 3)
        processes[pid] = {'cpuSeconds': cpu_seconds(cpu), 'rssMiB': int(rss) / 1024,
                          'command': command}
    return {'seconds': time.monotonic(), 'processes': processes}


samples = [sample()]
start = time.monotonic()
while time.monotonic() - start < args.duration:
    time.sleep(min(10, args.duration - (time.monotonic() - start)))
    samples.append(sample())
duration = samples[-1]['seconds'] - samples[0]['seconds']
summary = {}
for pid, first in samples[0]['processes'].items():
    values = [entry['processes'][pid] for entry in samples if pid in entry['processes']]
    summary[pid] = {'command': first['command'],
                    'averageCpuPercent': round((values[-1]['cpuSeconds'] - first['cpuSeconds']) / duration * 100, 2),
                    'rssMiBRange': [round(min(p['rssMiB'] for p in values), 1),
                                   round(max(p['rssMiB'] for p in values), 1)]}
report = {'label': args.label, 'durationSeconds': round(duration, 1),
          'processes': summary, 'samples': samples}
Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'samples'}, indent=2))
